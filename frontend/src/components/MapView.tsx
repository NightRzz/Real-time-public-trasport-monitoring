import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Box } from '@mui/material'
import { GDANSK_CENTER, GDANSK_ZOOM } from '../constants/map'

const DEFAULT_STYLE = 'https://demotiles.maplibre.org/style.json'

export interface MapViewProps {
  styleUrl?: string
  center?: [number, number]
  zoom?: number
}

export function MapView({
  styleUrl = DEFAULT_STYLE,
  center = GDANSK_CENTER,
  zoom = GDANSK_ZOOM,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialView = useRef({ center, zoom })

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      center: initialView.current.center,
      zoom: initialView.current.zoom,
    })
    map.addControl(new NavigationControl(), 'top-right')
    return () => map.remove()
  }, [styleUrl])

  return <Box ref={containerRef} data-testid="map" sx={{ position: 'absolute', inset: 0 }} />
}
