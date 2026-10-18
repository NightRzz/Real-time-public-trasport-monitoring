import { useEffect, useRef, type RefObject } from 'react'
import { LngLatBounds, type GeoJSONSource } from 'maplibre-gl'
import type { Feature, LineString } from 'geojson'
import { useMap } from '../map/MapContext'
import { BUS_COLOR, TRAM_COLOR } from '../map/vehicleStyle'
import type { VehicleType } from '../types/vehicle'
import { VEHICLES_LAYER } from './VehicleLayer'

export const ROUTE_SOURCE = 'selected-route'
export const ROUTE_LAYER = 'selected-route-line'
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

export function RouteLayer({
  route,
  vehicleType,
  sheetRef,
}: {
  route: Feature<LineString> | null
  vehicleType?: VehicleType
  sheetRef: RefObject<HTMLDivElement | null>
}) {
  const map = useMap()
  const fitted = useRef<string | null>(null)

  useEffect(() => {
    if (!map) return
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: EMPTY })
    const before = map.getLayer(VEHICLES_LAYER) ? VEHICLES_LAYER : undefined
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
    return () => {
      if (!map.style) return
      if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER)
      if (map.getLayer(`${ROUTE_LAYER}-outline`)) map.removeLayer(`${ROUTE_LAYER}-outline`)
      if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE)
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>(ROUTE_SOURCE)?.setData(route ?? EMPTY)
    map.setPaintProperty(ROUTE_LAYER, 'line-color', vehicleType === 'tram' ? TRAM_COLOR : BUS_COLOR)
  }, [map, route, vehicleType])

  useEffect(() => {
    if (!map) return
    if (!route) {
      fitted.current = null
      return
    }
    const container = map.getContainer()
    const sheet = sheetRef.current
    if (!sheet || route.geometry.coordinates.length < 2) return
    const bounds = route.geometry.coordinates.reduce(
      (bounds, [lon, lat]) => bounds.extend([lon, lat]),
      new LngLatBounds(),
    )
    const fit = () => {
      const bottom = sheet.offsetHeight + parseFloat(getComputedStyle(sheet).bottom) + 16
      const key = JSON.stringify([
        route.geometry.coordinates,
        container.clientWidth,
        container.clientHeight,
        bottom,
      ])
      if (key === fitted.current) return
      fitted.current = key
      map.fitBounds(bounds, {
        padding: { top: 48, left: 24, right: 24, bottom },
        maxZoom: 15,
        duration: 0,
      })
    }
    const observer = new ResizeObserver(fit)
    observer.observe(sheet)
    observer.observe(container)
    fit()
    return () => observer.disconnect()
  }, [map, route, sheetRef])

  return null
}
