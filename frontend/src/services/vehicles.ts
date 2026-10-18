import type { VehicleCollection, VehicleJourney } from '../types/vehicle'
import { api } from './api'

export async function fetchVehicles(): Promise<VehicleCollection> {
  const { data } = await api.get<VehicleCollection>('/api/vehicles')
  return data
}

export async function fetchVehicleJourney(
  id: number,
  signal?: AbortSignal,
): Promise<VehicleJourney> {
  const { data } = await api.get<VehicleJourney>(`/api/vehicles/${id}/journey`, { signal })
  return data
}
