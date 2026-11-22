import { useEffect, useRef } from 'react'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import { useMap } from '../map/MapContext'
import {
  BUS_COLOR,
  BUS_DIRECTION_IMAGE,
  TRAM_COLOR,
  TRAM_DIRECTION_IMAGE,
  createDirectionImage,
  vehicleCirclePaint,
  vehicleDirectionLayout,
  vehicleLabelLayout,
  vehicleLabelPaint,
  vehicleStrokeColor,
  vehicleStrokeWidth,
} from '../map/vehicleStyle'
import type { VehicleCollection } from '../types/vehicle'
import {
  glidePose,
  glidePosition,
  positions,
  remainingPath,
  samePosition,
  type Glide,
  type Position,
} from '../map/animation'

export const VEHICLES_SOURCE = 'vehicles'
export const VEHICLES_LAYER = 'vehicles-circle'
export const VEHICLES_LABEL_LAYER = 'vehicles-label'
export const VEHICLES_DIRECTION_LAYER = 'vehicles-direction'
export const ANIMATION_MS = 1500
export const MAX_ANIMATED_STEP = 0.005

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

interface VehicleLayerProps {
  data: VehicleCollection
  onSelect?: (vehicleId: number) => void
  selectedId?: number | null
  animationMs?: number
}

export function VehicleLayer({
  data,
  onSelect,
  selectedId,
  animationMs = ANIMATION_MS,
}: VehicleLayerProps) {
  const map = useMap()
  const initialData = useRef(data)
  const shown = useRef<Map<number, Position>>(new Map())
  const glides = useRef<Map<number, Glide>>(new Map())

  useEffect(() => {
    if (!map) return
    map.addImage(TRAM_DIRECTION_IMAGE, createDirectionImage(TRAM_COLOR), { pixelRatio: 2 })
    map.addImage(BUS_DIRECTION_IMAGE, createDirectionImage(BUS_COLOR), { pixelRatio: 2 })
    map.addSource(VEHICLES_SOURCE, { type: 'geojson', data: initialData.current })
    map.addLayer({
      id: VEHICLES_LAYER,
      type: 'circle',
      source: VEHICLES_SOURCE,
      paint: vehicleCirclePaint,
    })
    map.addLayer({
      id: VEHICLES_DIRECTION_LAYER,
      type: 'symbol',
      source: VEHICLES_SOURCE,
      filter: ['==', ['typeof', ['get', 'direction']], 'number'],
      layout: vehicleDirectionLayout,
    })
    map.addLayer({
      id: VEHICLES_LABEL_LAYER,
      type: 'symbol',
      source: VEHICLES_SOURCE,
      minzoom: 13,
      layout: vehicleLabelLayout,
      paint: vehicleLabelPaint,
    })
    return () => {
      if (!map.style) return
      if (map.getLayer(VEHICLES_LABEL_LAYER)) map.removeLayer(VEHICLES_LABEL_LAYER)
      if (map.getLayer(VEHICLES_DIRECTION_LAYER)) map.removeLayer(VEHICLES_DIRECTION_LAYER)
      if (map.getLayer(VEHICLES_LAYER)) map.removeLayer(VEHICLES_LAYER)
      if (map.getSource(VEHICLES_SOURCE)) map.removeSource(VEHICLES_SOURCE)
      if (map.hasImage(TRAM_DIRECTION_IMAGE)) map.removeImage(TRAM_DIRECTION_IMAGE)
      if (map.hasImage(BUS_DIRECTION_IMAGE)) map.removeImage(BUS_DIRECTION_IMAGE)
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    const source = map.getSource<GeoJSONSource>(VEHICLES_SOURCE)
    if (!source) return
    const now = performance.now()
    const animate = !prefersReducedMotion() && typeof requestAnimationFrame === 'function'
    const next = new Map<number, Glide>()
    for (const feature of data.features) {
      const id = feature.properties.vehicle_id
      const target = feature.geometry.coordinates as Position
      const glide = glides.current.get(id)
      if (glide && samePosition(glide.to, target)) {
        next.set(id, glide)
        continue
      }
      const current = glide ? glidePosition(glide, now) : shown.current.get(id)
      if (!animate || !current || samePosition(current, target)) continue
      const path = feature.properties.path ? remainingPath(feature.properties.path, current) : null
      const near =
        Math.abs(current[0] - target[0]) < MAX_ANIMATED_STEP &&
        Math.abs(current[1] - target[1]) < MAX_ANIMATED_STEP
      const duration = feature.properties.glide_ms ?? animationMs
      if (path || near) {
        next.set(id, { from: current, to: target, path, started: now, duration })
      }
    }
    glides.current = next
    const render = (time: number) => {
      const collection = {
        ...data,
        features: data.features.map((feature) => {
          const glide = glides.current.get(feature.properties.vehicle_id)
          if (!glide) return feature
          if (time >= glide.started + glide.duration) {
            glides.current.delete(feature.properties.vehicle_id)
          }
          const pose = glidePose(glide, time)
          return {
            ...feature,
            geometry: { ...feature.geometry, coordinates: pose.position },
            properties:
              pose.bearing !== null
                ? { ...feature.properties, direction: pose.bearing }
                : feature.properties,
          }
        }),
      }
      source.setData(collection)
      shown.current = positions(collection)
    }
    if (glides.current.size === 0) {
      render(now)
      return
    }
    let frame = 0
    const step = (time: number) => {
      render(time)
      if (glides.current.size > 0) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [map, data, animationMs])

  useEffect(() => {
    if (!map || !onSelect) return
    const select = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.vehicle_id
      if (typeof id === 'number') onSelect(id)
    }
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      map.getCanvas().style.cursor = ''
    }
    const layers = [VEHICLES_LAYER, VEHICLES_LABEL_LAYER, VEHICLES_DIRECTION_LAYER]
    map.on('click', layers, select)
    map.on('mouseenter', layers, enter)
    map.on('mouseleave', layers, leave)
    return () => {
      map.off('click', layers, select)
      map.off('mouseenter', layers, enter)
      map.off('mouseleave', layers, leave)
      leave()
    }
  }, [map, onSelect])

  useEffect(() => {
    if (!map) return
    map.setPaintProperty(VEHICLES_LAYER, 'circle-stroke-color', vehicleStrokeColor(selectedId))
    map.setPaintProperty(VEHICLES_LAYER, 'circle-stroke-width', vehicleStrokeWidth(selectedId))
  }, [map, selectedId])

  return null
}
