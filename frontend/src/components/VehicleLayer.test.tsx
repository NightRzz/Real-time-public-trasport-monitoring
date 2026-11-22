import { render } from '@testing-library/react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MapContext } from '../map/MapContext'
import type { VehicleCollection } from '../types/vehicle'
import { BUS_DIRECTION_IMAGE, HOLDING_COLOR, TRAM_DIRECTION_IMAGE } from '../map/vehicleStyle'
import {
  VEHICLES_DIRECTION_LAYER,
  VEHICLES_LABEL_LAYER,
  VEHICLES_LAYER,
  VEHICLES_SOURCE,
  VehicleLayer,
  ANIMATION_MS,
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
        vehicle_code: '1001',
        route_id: 8,
        trip_id: 11,
        scheduled_trip_start_time: '2026-10-02T11:30:00Z',
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
    setPaintProperty: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
  }
}

describe('VehicleLayer', () => {
  it('selects a vehicle from a map click and removes listeners on unmount', () => {
    const map = createMap()
    const onSelect = vi.fn()
    const { unmount } = render(
      <MapContext.Provider value={map as unknown as MapLibreMap}>
        <VehicleLayer data={data} onSelect={onSelect} />
      </MapContext.Provider>,
    )
    const handler = map.on.mock.calls.find(([event]) => event === 'click')![2]
    handler({ features: [{ properties: { vehicle_id: 1 } }] })
    expect(onSelect).toHaveBeenCalledWith(1)
    handler({ features: [] })
    expect(onSelect).toHaveBeenCalledTimes(1)
    unmount()
    expect(map.off).toHaveBeenCalledWith('click', expect.any(Array), handler)
  })

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
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      VEHICLES_LAYER,
      'circle-stroke-color',
      expect.arrayContaining([['==', ['get', 'holding'], true], HOLDING_COLOR]),
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

  describe('animation', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    function withFrames() {
      const frames = new Map<number, FrameRequestCallback>()
      let id = 0
      let clock = 0
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        frames.set(++id, cb)
        return id
      })
      vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame))
      vi.spyOn(performance, 'now').mockImplementation(() => clock)
      return (time: number) => {
        clock = time
        const pending = [...frames.values()]
        frames.clear()
        for (const cb of pending) cb(time)
      }
    }

    function moved(
      lon: number,
      lat = 54.35,
      path?: [number, number][],
      glideMs?: number,
    ): VehicleCollection {
      return {
        ...data,
        features: [
          {
            ...data.features[0],
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: { ...data.features[0].properties, path, glide_ms: glideMs },
          },
        ],
      }
    }

    function lastFeature(map: ReturnType<typeof createMap>) {
      const collection = map.source.setData.mock.calls.at(-1)![0] as VehicleCollection
      return collection.features[0]
    }

    function last(map: ReturnType<typeof createMap>) {
      return lastFeature(map).geometry.coordinates
    }

    function setup(animationMs?: number) {
      const map = createMap()
      const view = (collection: VehicleCollection) => (
        <MapContext.Provider value={map as unknown as MapLibreMap}>
          <VehicleLayer data={collection} animationMs={animationMs} />
        </MapContext.Provider>
      )
      const { rerender } = render(view(data))
      return { map, update: (collection: VehicleCollection) => rerender(view(collection)) }
    }

    it('glides a vehicle to its new position', () => {
      const runFrame = withFrames()
      const { map, update } = setup()
      update(moved(18.602))

      runFrame(ANIMATION_MS / 2)
      expect(last(map)[0]).toBeCloseTo(18.601)
      runFrame(ANIMATION_MS)
      expect(last(map)[0]).toBeCloseTo(18.602)
    })

    it('follows the route path sent with a new position', () => {
      const runFrame = withFrames()
      const { map, update } = setup(1500)
      update(
        moved(18.602, 54.35, [
          [18.6, 54.35],
          [18.6, 54.351],
          [18.602, 54.35],
        ]),
      )

      runFrame(300)
      expect(last(map)[0]).toBeCloseTo(18.6)
      expect(last(map)[1]).toBeGreaterThan(54.35)
      runFrame(1500)
      expect(last(map)[0]).toBeCloseTo(18.602)
    })

    it('keeps gliding when the server repeats the same position', () => {
      const runFrame = withFrames()
      const { map, update } = setup()
      update(moved(18.602))
      runFrame(ANIMATION_MS / 2)

      update(moved(18.602))
      runFrame(ANIMATION_MS * 0.75)

      expect(last(map)[0]).toBeCloseTo(18.6015, 5)
    })

    it('never runs back along the route when a new position arrives mid-glide', () => {
      const runFrame = withFrames()
      const { map, update } = setup(1000)
      const route: [number, number][] = [
        [18.6, 54.35],
        [18.6, 54.351],
        [18.602, 54.351],
        [18.604, 54.351],
      ]
      update(moved(18.602, 54.351, route.slice(0, 3)))
      runFrame(700)
      const [midLon, midLat] = last(map) as [number, number]
      expect(midLat).toBeCloseTo(54.351)

      update(moved(18.604, 54.351, route))
      runFrame(800)

      const [lon, lat] = last(map) as [number, number]
      expect(lat).toBeCloseTo(54.351)
      expect(lon).toBeGreaterThan(midLon)
      expect(midLat).toBeCloseTo(lat)
    })

    it('jumps when a vehicle moved too far to animate', () => {
      withFrames()
      const { map, update } = setup()
      update(moved(18.7))

      expect(last(map)[0]).toBe(18.7)
    })

    it('respects server glide_ms and rotates bearing along curves', () => {
      const runFrame = withFrames()
      const { map, update } = setup(1500)
      update(
        moved(
          18.602,
          54.351,
          [
            [18.6, 54.35],
            [18.6, 54.351],
            [18.602, 54.351],
          ],
          1000,
        ),
      )

      runFrame(200)
      expect(lastFeature(map).properties.direction).toBe(0)
      runFrame(800)
      expect(lastFeature(map).properties.direction).toBe(90)
      runFrame(1000)
      expect(last(map)).toEqual([18.602, 54.351])
    })
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
