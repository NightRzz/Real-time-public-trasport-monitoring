import type { VehicleCollection } from '../types/vehicle'
import { api } from './api'

export async function fetchVehicles(): Promise<VehicleCollection> {
  const { data } = await api.get<VehicleCollection>('/api/vehicles')
  return data
}
