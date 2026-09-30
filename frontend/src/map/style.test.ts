import type { StyleSpecification } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { removePoiLayers } from './style'

describe('removePoiLayers', () => {
  it('drops shop and service poi but keeps transit and roads', () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: 'background', type: 'background' },
        { id: 'road_primary', type: 'line', source: 'openmaptiles' },
        { id: 'poi_r1', type: 'symbol', source: 'openmaptiles' },
        { id: 'poi_r20', type: 'symbol', source: 'openmaptiles' },
        { id: 'poi_transit', type: 'symbol', source: 'openmaptiles' },
      ],
    } as StyleSpecification

    const ids = removePoiLayers(style).layers.map((l) => l.id)

    expect(ids).toEqual(['background', 'road_primary', 'poi_transit'])
  })
})
