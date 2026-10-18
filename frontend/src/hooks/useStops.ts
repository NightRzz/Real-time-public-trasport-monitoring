import { useQuery } from '@tanstack/react-query'
import { fetchStopArrivals, fetchStops } from '../services/stops'

export function useStops() {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' })
  return useQuery({
    queryKey: ['stops', date],
    queryFn: ({ signal }) => fetchStops(signal),
    staleTime: 3_600_000,
    refetchInterval: (query) => (query.state.status === 'error' ? 10_000 : 3_600_000),
  })
}

export function useStopArrivals(id: number | null) {
  return useQuery({
    queryKey: ['stop-arrivals', id],
    queryFn: ({ signal }) => fetchStopArrivals(id!, signal),
    enabled: id !== null,
    refetchInterval: 10_000,
    staleTime: 5000,
  })
}
