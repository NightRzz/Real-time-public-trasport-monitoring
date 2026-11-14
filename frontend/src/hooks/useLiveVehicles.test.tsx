import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchVehicles } from '../services/vehicles'
import { useLiveVehicles } from './useLiveVehicles'

vi.mock('../services/vehicles', () => ({ fetchVehicles: vi.fn() }))

class FakeSocket {
  static instances: FakeSocket[] = []
  static OPEN = 1
  readyState = 0
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

const frame = {
  type: 'vehicles',
  last_update: '2026-11-12T12:00:00Z',
  total: 240,
  detailed: true,
  features: [],
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const latest = () => FakeSocket.instances.at(-1)!

describe('useLiveVehicles', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.mocked(fetchVehicles).mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('sends viewport, selection and watched vehicles once connected', () => {
    const viewport = {
      bbox: [18.5, 54.3, 18.7, 54.5] as [number, number, number, number],
      zoom: 14,
    }
    renderHook(
      () => useLiveVehicles({ viewport, selectedId: 7, watchedIds: [3, 1, 3], url: 'ws://x' }),
      { wrapper },
    )

    act(() => latest().open())

    expect(latest().url).toBe('ws://x')
    expect(latest().sent).toEqual([
      { type: 'viewport', ...viewport },
      { type: 'select', vehicle_id: 7 },
      { type: 'watch', vehicle_ids: [1, 3] },
    ])
  })

  it('returns live frames with city-wide total', () => {
    const { result } = renderHook(
      () => useLiveVehicles({ viewport: null, selectedId: null, url: 'ws://x' }),
      { wrapper },
    )

    act(() => latest().open())
    act(() => latest().receive(frame))

    expect(result.current.status).toBe('open')
    expect(result.current.total).toBe(240)
    expect(result.current.data?.type).toBe('FeatureCollection')
    expect(result.current.error).toBeNull()
  })

  it('updates the server when the viewport changes', () => {
    const { rerender } = renderHook(
      ({ zoom }) =>
        useLiveVehicles({
          viewport: { bbox: [18, 54, 19, 55], zoom },
          selectedId: null,
          url: 'ws://x',
        }),
      { wrapper, initialProps: { zoom: 11 } },
    )
    act(() => latest().open())
    latest().sent = []

    rerender({ zoom: 15 })

    expect(latest().sent).toEqual([{ type: 'viewport', bbox: [18, 54, 19, 55], zoom: 15 }])
  })

  it('falls back to rest polling and reconnects when the socket drops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(fetchVehicles).mockResolvedValue({
      type: 'FeatureCollection',
      last_update: null,
      features: [],
    })
    const { result } = renderHook(
      () => useLiveVehicles({ viewport: null, selectedId: null, url: 'ws://x' }),
      { wrapper },
    )

    act(() => latest().close())

    expect(result.current.status).toBe('closed')
    await waitFor(() => expect(fetchVehicles).toHaveBeenCalled())
    await waitFor(() => expect(result.current.data).toBeDefined())
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('ignores malformed messages', () => {
    const { result } = renderHook(
      () => useLiveVehicles({ viewport: null, selectedId: null, url: 'ws://x' }),
      { wrapper },
    )
    act(() => latest().open())
    act(() => {
      latest().onmessage?.({ data: 'nope' })
      latest().receive({ type: 'other' })
    })

    expect(result.current.data).toBeUndefined()
  })
})
