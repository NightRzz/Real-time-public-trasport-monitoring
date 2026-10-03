import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

describe('useNow', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks every interval', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T10:00:00Z'))

    const { result } = renderHook(() => useNow(5000))
    const start = result.current
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current - start).toBe(5000)
  })
})
