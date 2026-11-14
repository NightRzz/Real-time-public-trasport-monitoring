import { useEffect, useRef, useState } from 'react'
import { LIVE_URL } from '../config'
import type { LiveFrame, VehicleCollection, Viewport } from '../types/vehicle'
import { useVehicles } from './useVehicles'

export type LiveStatus = 'connecting' | 'open' | 'closed'

export const MAX_RECONNECT_DELAY_MS = 10_000

interface LiveOptions {
  viewport: Viewport | null
  selectedId: number | null
  watchedIds?: number[]
  url?: string
}

interface LiveVehicles {
  data: VehicleCollection | undefined
  total: number
  status: LiveStatus
  isLoading: boolean
  error: Error | null
}

interface LiveState {
  viewport: Viewport | null
  selectedId: number | null
  watchedKey: string
}

function transmit(socket: WebSocket | null, message: object) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function watchMessage(watchedKey: string) {
  return { type: 'watch', vehicle_ids: watchedKey ? watchedKey.split(',').map(Number) : [] }
}

function stateMessages({ viewport, selectedId, watchedKey }: LiveState): object[] {
  return [
    ...(viewport ? [{ type: 'viewport', ...viewport }] : []),
    { type: 'select', vehicle_id: selectedId },
    watchMessage(watchedKey),
  ]
}

function isFrame(value: unknown): value is Omit<LiveFrame, 'type'> & { type: 'vehicles' } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'vehicles' &&
    Array.isArray((value as { features?: unknown }).features)
  )
}

export function useLiveVehicles({
  viewport,
  selectedId,
  watchedIds = [],
  url = LIVE_URL,
}: LiveOptions): LiveVehicles {
  const [frame, setFrame] = useState<LiveFrame | null>(null)
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const socketRef = useRef<WebSocket | null>(null)
  const watchedKey = [...new Set(watchedIds)].sort((a, b) => a - b).join(',')
  const latest = useRef<LiveState>({ viewport, selectedId, watchedKey })

  useEffect(() => {
    latest.current = { ...latest.current, viewport }
    if (viewport) transmit(socketRef.current, { type: 'viewport', ...viewport })
  }, [viewport])

  useEffect(() => {
    latest.current = { ...latest.current, selectedId }
    transmit(socketRef.current, { type: 'select', vehicle_id: selectedId })
  }, [selectedId])

  useEffect(() => {
    latest.current = { ...latest.current, watchedKey }
    transmit(socketRef.current, watchMessage(watchedKey))
  }, [watchedKey])

  useEffect(() => {
    let stopped = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      const socket = new WebSocket(url)
      socketRef.current = socket
      socket.onopen = () => {
        attempt = 0
        setStatus('open')
        for (const message of stateMessages(latest.current)) transmit(socket, message)
      }
      socket.onmessage = (event) => {
        try {
          const message: unknown = JSON.parse(event.data)
          if (isFrame(message)) setFrame({ ...message, type: 'FeatureCollection' })
        } catch {
          return
        }
      }
      socket.onerror = () => socket.close()
      socket.onclose = () => {
        if (stopped) return
        if (socketRef.current === socket) socketRef.current = null
        setStatus('closed')
        const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** attempt)
        attempt += 1
        timer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      stopped = true
      clearTimeout(timer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [url])

  const live = status === 'open'
  const rest = useVehicles(status === 'closed')
  const data = live ? (frame ?? undefined) : (rest.data ?? frame ?? undefined)
  const total = live && frame ? frame.total : (data?.features.length ?? 0)

  return {
    data,
    total,
    status,
    isLoading: !data && (status === 'connecting' || rest.isLoading),
    error: live ? null : rest.error,
  }
}
