import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Box } from '@mui/material'
import { GDANSK_CENTER, GDANSK_ZOOM, MAX_ZOOM, MIN_ZOOM, TRICITY_BOUNDS } from '../constants/map'

const DEFAULT_STYLE = 'https://demotiles.maplibre.org/style.json'

export interface MapViewState {
  center: [number, number]
  zoom: number
}

export interface MapViewProps {
  styleUrl?: string
  center?: [number, number]
  zoom?: number
  onViewChange?: (view: MapViewState) => void
}

export function MapView({
  styleUrl = DEFAULT_STYLE,
  center = GDANSK_CENTER,
  zoom = GDANSK_ZOOM,
  onViewChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialView = useRef({ center, zoom })
  const onViewChangeRef = useRef(onViewChange)

  useEffect(() => {
    onViewChangeRef.current = onViewChange
  }, [onViewChange])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      center: initialView.current.center,
      zoom: initialView.current.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: TRICITY_BOUNDS,
    })
    map.addControl(new NavigationControl(), 'top-right')
    map.on('moveend', () => {
      const { lng, lat } = map.getCenter()
      onViewChangeRef.current?.({ center: [lng, lat], zoom: map.getZoom() })
    })
    return () => map.remove()
  }, [styleUrl])

  return <Box ref={containerRef} data-testid="map" sx={{ position: 'absolute', inset: 0 }} />
}
