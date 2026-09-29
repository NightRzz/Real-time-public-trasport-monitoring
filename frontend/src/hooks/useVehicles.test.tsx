import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fetchVehicles } from '../services/vehicles'
import { useVehicles } from './useVehicles'

vi.mock('../services/vehicles', () => ({ fetchVehicles: vi.fn() }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useVehicles', () => {
  it('returns vehicles from api', async () => {
    const body = { type: 'FeatureCollection' as const, features: [], last_update: null }
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
})
