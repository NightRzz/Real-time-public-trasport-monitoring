import { render } from '@testing-library/react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { MapContext } from '../map/MapContext'
import type { VehicleCollection } from '../types/vehicle'
import { BUS_DIRECTION_IMAGE, TRAM_DIRECTION_IMAGE } from '../map/vehicleStyle'
import {
  VEHICLES_DIRECTION_LAYER,
  VEHICLES_LABEL_LAYER,
  VEHICLES_LAYER,
  VEHICLES_SOURCE,
  VehicleLayer,
} from './VehicleLayer'

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
    addImage: vi.fn(),
    hasImage: vi.fn(() => true),
    removeImage: vi.fn(),
    getLayer: vi.fn(() => true),
    getSource: vi.fn(() => source),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
  }
}

describe('VehicleLayer', () => {
  it('adds geojson source, circle, direction and line label layers', () => {
    const map = createMap()

    render(
      <MapContext.Provider value={map as unknown as MapLibreMap}>
        <VehicleLayer data={data} />
      </MapContext.Provider>,
    )

    expect(map.addSource).toHaveBeenCalledWith(VEHICLES_SOURCE, { type: 'geojson', data })
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: VEHICLES_LAYER }))
    expect(map.addImage).toHaveBeenCalledWith(
      TRAM_DIRECTION_IMAGE,
      expect.objectContaining({ data: expect.any(Uint8Array) }),
      { pixelRatio: 2 },
    )
    expect(map.addImage).toHaveBeenCalledWith(
      BUS_DIRECTION_IMAGE,
      expect.objectContaining({ data: expect.any(Uint8Array) }),
      { pixelRatio: 2 },
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: VEHICLES_DIRECTION_LAYER,
        filter: ['==', ['typeof', ['get', 'direction']], 'number'],
        layout: expect.objectContaining({
          'icon-rotate': ['get', 'direction'],
          'icon-rotation-alignment': 'map',
        }),
      }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: VEHICLES_LABEL_LAYER,
        layout: expect.objectContaining({ 'text-field': ['get', 'line'] }),
      }),
    )
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

    expect(map.removeLayer).toHaveBeenCalledWith(VEHICLES_LABEL_LAYER)
    expect(map.removeLayer).toHaveBeenCalledWith(VEHICLES_DIRECTION_LAYER)
    expect(map.removeLayer).toHaveBeenCalledWith(VEHICLES_LAYER)
    expect(map.removeSource).toHaveBeenCalledWith(VEHICLES_SOURCE)
    expect(map.removeImage).toHaveBeenCalledWith(TRAM_DIRECTION_IMAGE)
    expect(map.removeImage).toHaveBeenCalledWith(BUS_DIRECTION_IMAGE)
  })
})
