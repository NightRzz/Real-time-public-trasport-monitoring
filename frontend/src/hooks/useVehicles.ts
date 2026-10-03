import { useQuery } from '@tanstack/react-query'
import { POLL_INTERVAL_MS } from '../config'
import { fetchVehicles } from '../services/vehicles'

export function useVehicles() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles'],
    queryFn: fetchVehicles,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
  })
  return { data, isLoading, error }
}
