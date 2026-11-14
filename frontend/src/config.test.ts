import { describe, expect, it } from 'vitest'
import { DEFAULT_POLL_INTERVAL_MS, liveUrl, parsePollInterval } from './config'

describe('parsePollInterval', () => {
  it('uses value from env', () => {
    expect(parsePollInterval('15000')).toBe(15000)
  })

  it.each([undefined, '', 'abc', '0', '-100', '500'])('falls back to default for %s', (raw) => {
    expect(parsePollInterval(raw)).toBe(DEFAULT_POLL_INTERVAL_MS)
  })
})

describe('liveUrl', () => {
  it.each([
    ['http://localhost:8000', 'ws://localhost:8000/ws/vehicles'],
    ['https://transport.example.pl', 'wss://transport.example.pl/ws/vehicles'],
    ['https://example.pl/backend/', 'wss://example.pl/backend/ws/vehicles'],
  ])('builds socket address from %s', (api, expected) => {
    expect(liveUrl(api)).toBe(expected)
  })
})
