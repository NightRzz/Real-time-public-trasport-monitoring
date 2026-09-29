import { useQuery } from '@tanstack/react-query'
import { fetchVehicles } from '../services/vehicles'

export function useVehicles() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles'],
    queryFn: fetchVehicles,
  })
  return { data, isLoading, error }
}
