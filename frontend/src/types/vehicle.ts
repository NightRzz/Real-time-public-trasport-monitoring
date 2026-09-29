import type { FeatureCollection, Point } from 'geojson'

export type VehicleType = 'bus' | 'tram'

export interface VehicleProperties {
  vehicle_id: number
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
