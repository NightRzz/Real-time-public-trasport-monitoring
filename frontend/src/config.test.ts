import { describe, expect, it } from 'vitest'
import { DEFAULT_POLL_INTERVAL_MS, parsePollInterval } from './config'

describe('parsePollInterval', () => {
  it('uses value from env', () => {
    expect(parsePollInterval('15000')).toBe(15000)
  })

  it.each([undefined, '', 'abc', '0', '-100', '500'])('falls back to default for %s', (raw) => {
    expect(parsePollInterval(raw)).toBe(DEFAULT_POLL_INTERVAL_MS)
  })
})
