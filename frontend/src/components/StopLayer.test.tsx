import { render } from '@testing-library/react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, expect, it, vi } from 'vitest'
import { MapContext } from '../map/MapContext'
import type { StopCollection } from '../types/stop'
import { StopLayer } from './StopLayer'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('restores missing images and the low-zoom layer on an existing map before selecting a route', () => {
  vi.stubGlobal('Path2D', class {})
  const context = Object.fromEntries(
    [
      'scale',
      'beginPath',
      'roundRect',
      'fill',
      'stroke',
      'save',
      'clip',
      'fillRect',
      'restore',
      'translate',
    ].map((name) => [name, vi.fn()]),
  )
  context.getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  const images = new Set<string>()
  const layers = new Map<string, { id: string }>()
  const map = {
    style: {},
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string) => images.add(id)),
    removeImage: (id: string) => images.delete(id),
    addSource: vi.fn(),
    addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
    removeSource: vi.fn(),
    removeLayer: (id: string) => layers.delete(id),
    getSource: () => ({ setData: vi.fn() }),
    getLayer: (id: string) => layers.get(id),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    setFilter: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getCanvas: () => ({ style: { cursor: '' } }),
  }
  const data: StopCollection = { type: 'FeatureCollection', features: [] }
  const view = (routeStopIds: number[] | null) => (
    <MapContext.Provider value={map as unknown as MapLibreMap}>
      <StopLayer data={data} selectedId={null} onSelect={() => {}} routeStopIds={routeStopIds} />
    </MapContext.Provider>
  )
  const { rerender } = render(view(null))
  expect(images.size).toBe(9)
  const muted = ['bus', 'tram', 'bus_tram'].map((type) => `stop-${type}-muted`)
  for (const id of muted) images.delete(id)
  layers.delete('route-stops-icon')
  map.addImage.mockClear()
  rerender(view([1]))
  expect(muted.every((id) => images.has(id))).toBe(true)
  expect(map.addImage.mock.calls.map(([id]) => id)).toEqual(muted)
  expect(layers.has('route-stops-icon')).toBe(true)
})
