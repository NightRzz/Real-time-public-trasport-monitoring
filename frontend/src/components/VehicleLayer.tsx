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
} from '../map/vehicleStyle'
import type { VehicleCollection } from '../types/vehicle'

export const VEHICLES_SOURCE = 'vehicles'
export const VEHICLES_LAYER = 'vehicles-circle'
export const VEHICLES_LABEL_LAYER = 'vehicles-label'
export const VEHICLES_DIRECTION_LAYER = 'vehicles-direction'

interface VehicleLayerProps {
  data: VehicleCollection
  onSelect?: (vehicleId: number) => void
  selectedId?: number | null
}

export function VehicleLayer({ data, onSelect, selectedId }: VehicleLayerProps) {
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
    map.setPaintProperty(VEHICLES_LAYER, 'circle-stroke-color', [
      'case',
      ['==', ['get', 'vehicle_id'], selectedId ?? -1],
      '#172b4d',
      '#ffffff',
    ])
    map.setPaintProperty(VEHICLES_LAYER, 'circle-stroke-width', [
      'case',
      ['==', ['get', 'vehicle_id'], selectedId ?? -1],
      4,
      1.5,
    ])
  }, [map, selectedId])

  return null
}
