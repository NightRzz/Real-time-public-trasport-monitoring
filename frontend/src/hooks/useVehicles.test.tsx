import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchVehicles } from '../services/vehicles'
import { useVehicles } from './useVehicles'

vi.mock('../services/vehicles', () => ({ fetchVehicles: vi.fn() }))
vi.mock('../config', () => ({ POLL_INTERVAL_MS: 50 }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const body = { type: 'FeatureCollection' as const, features: [], last_update: null }

describe('useVehicles', () => {
  beforeEach(() => {
    vi.mocked(fetchVehicles).mockReset()
  })

  afterEach(() => {
    focusManager.setFocused(undefined)
  })

  it('returns vehicles from api', async () => {
    vi.mocked(fetchVehicles).mockResolvedValue(body)

    const { result } = renderHook(() => useVehicles(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.data).toEqual(body))
    expect(result.current.error).toBeNull()
  })

  it('returns error when api fails', async () => {
    vi.mocked(fetchVehicles).mockRejectedValue(new Error('Network Error'))

    const { result } = renderHook(() => useVehicles(), { wrapper })

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
  })

  it('refetches on interval', async () => {
    vi.mocked(fetchVehicles).mockResolvedValue(body)

    renderHook(() => useVehicles(), { wrapper })

    await waitFor(() => expect(fetchVehicles).toHaveBeenCalledTimes(3))
  })

  it('does not poll when tab is hidden', async () => {
    vi.mocked(fetchVehicles).mockResolvedValue(body)

    const { result } = renderHook(() => useVehicles(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(body))
    focusManager.setFocused(false)
    const calls = vi.mocked(fetchVehicles).mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(fetchVehicles).toHaveBeenCalledTimes(calls)
  })
})
