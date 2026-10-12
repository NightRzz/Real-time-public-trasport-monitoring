import type { CircleLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl'

export const TRAM_COLOR = '#c62828'
export const BUS_COLOR = '#1565c0'
export const TRAM_DIRECTION_IMAGE = 'vehicle-direction-tram'
export const BUS_DIRECTION_IMAGE = 'vehicle-direction-bus'

// A north-facing triangle with a white outline, rendered at 2x resolution.
export function createDirectionImage(color: string) {
  const width = 32
  const height = 24
  const data = new Uint8Array(width * height * 4)
  const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = (x + 0.5) / 2
      const py = (y + 0.5) / 2
      const distance = Math.abs(px - 8)
      if (py < 1 || py > 11 || distance > (py - 1) * 0.7) continue
      const inside = py >= 3.5 && py <= 9.5 && distance <= (py - 3.5) * 0.7
      const offset = (y * width + x) * 4
      data.set(inside ? [...rgb, 255] : [255, 255, 255, 255], offset)
    }
  }
  return { width, height, data }
}

export const vehicleDirectionLayout: SymbolLayerSpecification['layout'] = {
  'icon-image': ['match', ['get', 'type'], 'tram', TRAM_DIRECTION_IMAGE, BUS_DIRECTION_IMAGE],
  'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 4 / 9, 13, 1, 16, 12 / 9],
  'icon-offset': [0, -17],
  'icon-rotate': ['get', 'direction'],
  'icon-rotation-alignment': 'map',
  'icon-pitch-alignment': 'viewport',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
}

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
