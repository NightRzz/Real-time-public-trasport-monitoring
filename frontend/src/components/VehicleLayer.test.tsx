import { render } from '@testing-library/react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { MapContext } from '../map/MapContext'
import type { VehicleCollection } from '../types/vehicle'
import { VEHICLES_LAYER, VEHICLES_SOURCE, VehicleLayer } from './VehicleLayer'

const data: VehicleCollection = {
  type: 'FeatureCollection',
  last_update: '2026-10-02T12:00:00Z',
  features: [
    {
      type: 'Feature',
      id: 1,
      geometry: { type: 'Point', coordinates: [18.6, 54.35] },
      properties: {
        vehicle_id: 1,
        line: '8',
        type: 'tram',
        headsign: 'Jelitkowo',
        speed: 20,
        direction: 90,
        delay: 0,
        timestamp: '2026-10-02T12:00:00Z',
      },
    },
  ],
}

function createMap() {
  const source = { setData: vi.fn() }
  return {
    source,
    style: {},
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn(() => true),
    getSource: vi.fn(() => source),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
  }
}

describe('VehicleLayer', () => {
  it('adds geojson source and circle layer', () => {
    const map = createMap()

    render(
      <MapContext.Provider value={map as unknown as MapLibreMap}>
        <VehicleLayer data={data} />
      </MapContext.Provider>,
    )

    expect(map.addSource).toHaveBeenCalledWith(VEHICLES_SOURCE, { type: 'geojson', data })
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: VEHICLES_LAYER }))
  })

  it('updates source when new data arrives', () => {
    const map = createMap()
    const next: VehicleCollection = { ...data, features: [], last_update: '2026-10-02T12:00:10Z' }

    const { rerender } = render(
      <MapContext.Provider value={map as unknown as MapLibreMap}>
        <VehicleLayer data={data} />
      </MapContext.Provider>,
    )
    rerender(
      <MapContext.Provider value={map as unknown as MapLibreMap}>
        <VehicleLayer data={next} />
      </MapContext.Provider>,
    )

    expect(map.source.setData).toHaveBeenLastCalledWith(next)
    expect(map.addSource).toHaveBeenCalledTimes(1)
  })

  it('cleans up layer on unmount', () => {
    const map = createMap()

    const { unmount } = render(
      <MapContext.Provider value={map as unknown as MapLibreMap}>
        <VehicleLayer data={data} />
      </MapContext.Provider>,
    )
    unmount()

    expect(map.removeLayer).toHaveBeenCalledWith(VEHICLES_LAYER)
    expect(map.removeSource).toHaveBeenCalledWith(VEHICLES_SOURCE)
  })
})
