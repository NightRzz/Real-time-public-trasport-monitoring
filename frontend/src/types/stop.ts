import type { Feature, FeatureCollection, Point } from 'geojson'
import type { VehicleType } from './vehicle'

export interface StopProperties {
  stop_id: number
  name: string
  code: string | null
  type: 'bus' | 'tram' | 'bus_tram'
}

export type StopFeature = Feature<Point, StopProperties>
export type StopCollection = FeatureCollection<Point, StopProperties>

export interface StopArrivals {
  status: 'available' | 'unavailable' | 'stale'
  arrivals: {
    vehicle_id?: number | null
    route_id?: number | null
    trip_id?: number | null
    scheduled_trip_start_time?: string | null
    line: string
    type: VehicleType
    headsign: string
    time: string
    realtime: boolean
    updated_at: string
  }[]
}
