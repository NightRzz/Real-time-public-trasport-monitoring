import { useEffect, useRef } from 'react'
import { useMap } from '../map/MapContext'
import type { VehicleCollection } from '../types/vehicle'

export const VEHICLES_SOURCE = 'vehicles'
export const VEHICLES_LAYER = 'vehicles-circle'

interface VehicleLayerProps {
  data: VehicleCollection
}

export function VehicleLayer({ data }: VehicleLayerProps) {
  const map = useMap()
  const initialData = useRef(data)

  useEffect(() => {
    if (!map) return
    map.addSource(VEHICLES_SOURCE, { type: 'geojson', data: initialData.current })
    map.addLayer({
      id: VEHICLES_LAYER,
      type: 'circle',
      source: VEHICLES_SOURCE,
      paint: {
        'circle-radius': 6,
        'circle-color': '#1565c0',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
    })
    return () => {
      if (!map.style) return
      if (map.getLayer(VEHICLES_LAYER)) map.removeLayer(VEHICLES_LAYER)
      if (map.getSource(VEHICLES_SOURCE)) map.removeSource(VEHICLES_SOURCE)
    }
  }, [map])

  return null
}
