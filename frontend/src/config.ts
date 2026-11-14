export const DEFAULT_API_URL = 'http://localhost:8000'
export const DEFAULT_POLL_INTERVAL_MS = 1000

export function parsePollInterval(raw: string | undefined): number {
  const value = Number(raw)
  return raw && Number.isFinite(value) && value >= 1000 ? value : DEFAULT_POLL_INTERVAL_MS
}

export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL
export const POLL_INTERVAL_MS = parsePollInterval(import.meta.env.VITE_POLL_INTERVAL_MS)

export function liveUrl(apiUrl: string): string {
  const url = new URL(apiUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/vehicles`
  url.search = ''
  url.hash = ''
  return url.toString()
}

export const LIVE_URL = liveUrl(API_URL)
