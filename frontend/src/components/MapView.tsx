import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Alert, Box } from '@mui/material'
import { GDANSK_CENTER, GDANSK_ZOOM, MAX_ZOOM, MIN_ZOOM, TRICITY_BOUNDS } from '../constants/map'
import { MapContext } from '../map/MapContext'
import { OPENFREEMAP_STYLE, removePoiLayers } from '../map/style'

// MapLibre v6 needs an explicit bundled worker URL in Vite production builds.
setWorkerUrl(workerUrl)

export interface MapViewState {
  center: [number, number]
  zoom: number
}

export interface MapViewProps {
  styleUrl?: string
  center?: [number, number]
  zoom?: number
  onViewChange?: (view: MapViewState) => void
  children?: ReactNode
}

export function MapView({
  styleUrl = OPENFREEMAP_STYLE,
  center = GDANSK_CENTER,
  zoom = GDANSK_ZOOM,
  onViewChange,
  children,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialView = useRef({ center, zoom })
  const onViewChangeRef = useRef(onViewChange)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [styleFailed, setStyleFailed] = useState(false)

  useEffect(() => {
    onViewChangeRef.current = onViewChange
  }, [onViewChange])

  useEffect(() => {
    if (!containerRef.current) return
    const instance = new MapLibreMap({
      container: containerRef.current,
      center: initialView.current.center,
      zoom: initialView.current.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: TRICITY_BOUNDS,
    })
    instance.setStyle(styleUrl, { transformStyle: (_, next) => removePoiLayers(next) })
    instance.addControl(new NavigationControl(), 'top-right')
    let loaded = false
    instance.on('load', () => {
      loaded = true
      setStyleFailed(false)
      setMap(instance)
    })
    instance.on('error', () => {
      if (!loaded) setStyleFailed(true)
    })
    instance.on('moveend', () => {
      const { lng, lat } = instance.getCenter()
      onViewChangeRef.current?.({ center: [lng, lat], zoom: instance.getZoom() })
    })
    return () => {
      setMap(null)
      setStyleFailed(false)
      instance.remove()
    }
  }, [styleUrl])

  return (
    <MapContext.Provider value={map}>
      <Box
        ref={containerRef}
        data-testid="map"
        data-loaded={!!map}
        sx={{ position: 'absolute', inset: 0 }}
      />
      {styleFailed && (
        <Alert
          severity="warning"
          sx={{
            position: 'absolute',
            top: 56,
            left: 12,
            right: 12,
            zIndex: 2,
            mx: 'auto',
            maxWidth: 480,
          }}
        >
          Nie udało się załadować mapy. Sprawdź połączenie z internetem i odśwież stronę.
        </Alert>
      )}
      {map && children}
    </MapContext.Provider>
  )
}
