import type { Page, Route } from '@playwright/test'

const scheduledTripStartTime = new Date(Date.now() - 600_000).toISOString()

export function vehicle(id: number, line: string, type: 'bus' | 'tram', lon: number, lat: number) {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      vehicle_id: id,
      vehicle_code: String(1000 + id),
      route_id: Number(line),
      trip_id: 11,
      scheduled_trip_start_time: scheduledTripStartTime,
      line,
      type,
      headsign: 'Dworzec Główny',
      speed: 20,
      direction: 90,
      delay: 0,
      timestamp: new Date().toISOString(),
    },
  }
}

export function collection(lastUpdate = new Date().toISOString()) {
  return {
    type: 'FeatureCollection',
    last_update: lastUpdate,
    features: [
      vehicle(1, '8', 'tram', 18.6466, 54.352),
      vehicle(2, '111', 'bus', 18.6, 54.37),
      vehicle(3, '2', 'tram', 18.62, 54.36),
    ],
  }
}

export async function mockVehicles(
  page: Page,
  handler: (route: Route) => Promise<void> | void = (route) =>
    route.fulfill({ json: collection() }),
) {
  await page.route('**/api/vehicles', handler)
  await page.route('**/api/stops', (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features: [] } }),
  )
}
