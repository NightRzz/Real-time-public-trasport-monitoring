import type { Feature, FeatureCollection, LineString, Point } from 'geojson'

export type VehicleType = 'bus' | 'tram'

export interface VehicleProperties {
  vehicle_id: number
  vehicle_code: string | null
  route_id: number | null
  trip_id: number | null
  scheduled_trip_start_time: string | null
  line: string
  type: VehicleType
  headsign: string | null
  speed: number | null
  direction: number | null
  delay: number | null
  timestamp: string
}

export type VehicleCollection = FeatureCollection<Point, VehicleProperties> & {
  last_update: string | null
}

export type VehicleFeature = Feature<Point, VehicleProperties>

export interface VehicleJourney {
  vehicle_id: number
  route_id: number | null
  trip_id: number | null
  route: Feature<LineString> | null
  stop_ids: number[] | null
  next_stop: {
    stop: { stop_id: number; name: string; code: string | null }
    estimated_time: string
    prediction_updated_at: string
  } | null
  route_status: 'available' | 'unavailable' | 'error'
  prediction_status: 'available' | 'unavailable' | 'stale' | 'error'
}
