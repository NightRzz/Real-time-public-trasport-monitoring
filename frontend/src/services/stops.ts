import { api } from './api'
import type { StopArrivals, StopCollection } from '../types/stop'

export async function fetchStops(signal?: AbortSignal): Promise<StopCollection> {
  const { data } = await api.get<StopCollection>('/api/stops', { signal })
  return data
}

export async function fetchStopArrivals(id: number, signal?: AbortSignal): Promise<StopArrivals> {
  const { data } = await api.get<StopArrivals>(`/api/stops/${id}/arrivals`, { signal })
  return data
}
