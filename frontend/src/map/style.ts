import type { FilterSpecification, StyleSpecification } from 'maplibre-gl'

export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const HIDDEN_LAYER_PREFIXES = ['poi_r']

export function removePoiLayers(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers
      .filter((layer) => !HIDDEN_LAYER_PREFIXES.some((prefix) => layer.id.startsWith(prefix)))
      .map((layer) =>
        layer.id === 'poi_transit' && layer.type === 'symbol'
          ? {
              ...layer,
              filter: [
                'all',
                layer.filter ?? true,
                [
                  'match',
                  ['get', 'subclass'],
                  ['bus_stop', 'bus_station', 'tram_stop', 'platform'],
                  false,
                  true,
                ],
              ] as FilterSpecification,
            }
          : layer,
      ),
  }
}
