import type { StyleSpecification } from 'maplibre-gl'

export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const HIDDEN_LAYER_PREFIXES = ['poi_r']

export function removePoiLayers(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.filter(
      (layer) => !HIDDEN_LAYER_PREFIXES.some((prefix) => layer.id.startsWith(prefix)),
    ),
  }
}
