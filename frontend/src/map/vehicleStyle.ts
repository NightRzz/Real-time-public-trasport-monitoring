import type { CircleLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl'

export const TRAM_COLOR = '#c62828'
export const BUS_COLOR = '#1565c0'

export const vehicleCirclePaint: CircleLayerSpecification['paint'] = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 13, 9, 16, 12],
  'circle-color': ['match', ['get', 'type'], 'tram', TRAM_COLOR, BUS_COLOR],
  'circle-stroke-width': 1.5,
  'circle-stroke-color': '#ffffff',
}

export const vehicleLabelLayout: SymbolLayerSpecification['layout'] = {
  'text-field': ['get', 'line'],
  'text-font': ['Noto Sans Bold'],
  'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 12],
  'text-allow-overlap': true,
  'text-ignore-placement': true,
}

export const vehicleLabelPaint: SymbolLayerSpecification['paint'] = {
  'text-color': '#ffffff',
}
