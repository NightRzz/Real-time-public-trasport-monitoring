import { useEffect, useRef } from 'react'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import type { GeoJSONSource } from 'maplibre-gl'
import type { Feature, LineString } from 'geojson'
import { useMap } from '../map/MapContext'
import { BUS_COLOR, TRAM_COLOR } from '../map/vehicleStyle'
import type { VehicleType } from '../types/vehicle'
import { VEHICLES_LAYER } from './VehicleLayer'
import { STOPS_LAYER } from './StopLayer'

export const ROUTE_SOURCE = 'selected-route'
export const ROUTE_LAYER = 'selected-route-line'
const ARROWS_LAYER = 'selected-route-arrows'
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

export function RouteLayer({
  route,
  vehicleType,
}: {
  route: Feature<LineString> | null
  vehicleType?: VehicleType
}) {
  const map = useMap()
  const arrow = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!map) return
    for (const [type, color] of [
      ['bus', BUS_COLOR],
      ['tram', TRAM_COLOR],
    ]) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 48
      const context = canvas.getContext('2d')!
      context.scale(2, 2)
      const path = new Path2D(arrow.current!.querySelector('path')!.getAttribute('d')!)
      context.strokeStyle = '#ffffff'
      context.lineWidth = 3
      context.lineJoin = 'round'
      context.stroke(path)
      context.fillStyle = color
      context.fill(path)
      map.addImage(`route-arrow-${type}`, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 })
    }
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: EMPTY })
    const before = map.getLayer(STOPS_LAYER)
      ? STOPS_LAYER
      : map.getLayer(VEHICLES_LAYER)
        ? VEHICLES_LAYER
        : undefined
    for (const [id, color, width] of [
      [`${ROUTE_LAYER}-outline`, '#ffffff', 8],
      [ROUTE_LAYER, BUS_COLOR, 4],
    ] as const) {
      map.addLayer(
        {
          id,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': color, 'line-width': width, 'line-opacity': 0.9 },
        },
        before,
      )
    }
    map.addLayer(
      {
        id: ARROWS_LAYER,
        type: 'symbol',
        source: ROUTE_SOURCE,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 100,
          'icon-image': 'route-arrow-bus',
          'icon-size': 0.85,
          'icon-rotation-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      },
      before,
    )
    return () => {
      if (!map.style) return
      if (map.getLayer(ARROWS_LAYER)) map.removeLayer(ARROWS_LAYER)
      if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER)
      if (map.getLayer(`${ROUTE_LAYER}-outline`)) map.removeLayer(`${ROUTE_LAYER}-outline`)
      if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE)
      for (const type of ['bus', 'tram']) {
        if (map.hasImage(`route-arrow-${type}`)) map.removeImage(`route-arrow-${type}`)
      }
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>(ROUTE_SOURCE)?.setData(route ?? EMPTY)
    map.setPaintProperty(ROUTE_LAYER, 'line-color', vehicleType === 'tram' ? TRAM_COLOR : BUS_COLOR)
    map.setLayoutProperty(ARROWS_LAYER, 'icon-image', `route-arrow-${vehicleType ?? 'bus'}`)
  }, [map, route, vehicleType])

  return (
    <span hidden>
      <ArrowForwardRoundedIcon ref={arrow} />
    </span>
  )
}
