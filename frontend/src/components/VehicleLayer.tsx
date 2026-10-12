import { useEffect, useRef } from 'react'
import type { GeoJSONSource } from 'maplibre-gl'
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
} from '../map/vehicleStyle'
import type { VehicleCollection } from '../types/vehicle'

export const VEHICLES_SOURCE = 'vehicles'
export const VEHICLES_LAYER = 'vehicles-circle'
export const VEHICLES_LABEL_LAYER = 'vehicles-label'
export const VEHICLES_DIRECTION_LAYER = 'vehicles-direction'

interface VehicleLayerProps {
  data: VehicleCollection
}

export function VehicleLayer({ data }: VehicleLayerProps) {
  const map = useMap()
  const initialData = useRef(data)

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
    map.getSource<GeoJSONSource>(VEHICLES_SOURCE)?.setData(data)
  }, [map, data])

  return null
}
