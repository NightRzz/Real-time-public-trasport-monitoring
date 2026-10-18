import { useQuery } from '@tanstack/react-query'
import { fetchVehicleJourney } from '../services/vehicles'
import type { VehicleFeature } from '../types/vehicle'

export function useVehicleJourney(vehicle: VehicleFeature | null, open: boolean) {
  const props = vehicle?.properties
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' })
  return useQuery({
    queryKey: [
      'journey',
      props?.vehicle_id,
      props?.route_id,
      props?.trip_id,
      props?.scheduled_trip_start_time,
      date,
    ],
    queryFn: ({ signal }) => fetchVehicleJourney(props!.vehicle_id, signal),
    enabled: !!vehicle && open,
    refetchInterval: 10_000,
    staleTime: 5000,
    // Do not display the preceding vehicle's journey while a new selection loads.
  })
}
