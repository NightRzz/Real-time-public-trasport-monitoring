import { Alert, Box, Typography } from '@mui/material'
import { useCallback, useRef, useState } from 'react'
import { LastUpdate } from './components/LastUpdate'
import { MapView, type MapFocus } from './components/MapView'
import { VehicleLayer } from './components/VehicleLayer'
import { VehicleStatus } from './components/VehicleStatus'
import { VehicleSheet } from './components/VehicleSheet'
import { RouteLayer } from './components/RouteLayer'
import { useNow } from './hooks/useNow'
import { useVehicles } from './hooks/useVehicles'
import { useVehicleJourney } from './hooks/useVehicleJourney'
import { useStopArrivals, useStops } from './hooks/useStops'
import { StopLayer } from './components/StopLayer'
import { StopSheet } from './components/StopSheet'

const topOf = (element: HTMLElement | null) =>
  element?.getBoundingClientRect().top ?? window.innerHeight

function App() {
  const { data, isLoading, error } = useVehicles()
  const now = useNow(5000)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null)
  const [mapFocus, setMapFocus] = useState<(MapFocus & { stopId?: number }) | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const stopSheetRef = useRef<HTMLDivElement>(null)
  const stops = useStops()
  const selectedStop =
    stops.data?.features.find((stop) => stop.properties.stop_id === selectedStopId) ?? null
  const arrivals = useStopArrivals(selectedStop?.properties.stop_id ?? null)
  const selected =
    data?.features.find((feature) => feature.properties.vehicle_id === selectedId) ?? null
  const journey = useVehicleJourney(selected, panelOpen)
  const selectVehicle = useCallback((id: number) => {
    setSelectedStopId(null)
    setMapFocus(null)
    setSelectedId(id)
    setPanelOpen(true)
  }, [])
  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setMapFocus(null)
  }, [])
  const selectStop = useCallback((id: number) => {
    setPanelOpen(false)
    setMapFocus(null)
    setSelectedStopId(id)
  }, [])
  const closeStop = useCallback(() => setSelectedStopId(null), [])
  const focusRouteStop = useCallback(
    (stopId: number) =>
      setMapFocus({
        stopId,
        center: stops.data?.features.find((stop) => stop.properties.stop_id === stopId)?.geometry
          .coordinates as [number, number] | undefined,
        sheetTop: topOf(sheetRef.current),
      }),
    [stops.data],
  )
  const focusVehicle = useCallback(
    () =>
      setMapFocus({
        center: selected?.geometry.coordinates as [number, number] | undefined,
        sheetTop: topOf(sheetRef.current),
      }),
    [selected],
  )
  const matchingJourney =
    journey.data?.route_id === selected?.properties.route_id &&
    journey.data?.trip_id === selected?.properties.trip_id
      ? journey.data
      : undefined
  const focusedStop = panelOpen && selected ? mapFocus : null

  return (
    <Box sx={{ height: '100%' }}>
      <Box component="main" sx={{ height: '100%', position: 'relative' }}>
        <Typography
          component="h1"
          sx={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          Gdańsk · Komunikacja
        </Typography>
        <MapView focus={focusedStop}>
          {stops.data && (
            <StopLayer
              data={stops.data}
              selectedId={selectedStopId ?? focusedStop?.stopId ?? null}
              onSelect={selectStop}
              routeStopIds={
                panelOpen && selected && matchingJourney?.route ? matchingJourney.stop_ids : null
              }
            />
          )}
          {data && (
            <VehicleLayer
              data={panelOpen && selected ? { ...data, features: [selected] } : data}
              onSelect={selectVehicle}
              selectedId={panelOpen ? selectedId : null}
            />
          )}
          <RouteLayer
            route={panelOpen && selected ? (matchingJourney?.route ?? null) : null}
            vehicleType={selected?.properties.type}
          />
        </MapView>
        <LastUpdate
          lastUpdate={data?.last_update}
          vehicleCount={data?.features.length ?? 0}
          offline={!!error}
          now={now}
        />
        <VehicleStatus isLoading={isLoading} error={error} />
        {stops.isError && (
          <Alert
            severity="warning"
            sx={{ position: 'absolute', top: 56, left: 12, right: 12, mx: 'auto', maxWidth: 480 }}
          >
            Nie udało się pobrać przystanków. Ponawiamy połączenie.
          </Alert>
        )}
      </Box>
      <VehicleSheet
        open={panelOpen && !!selected}
        vehicle={selected}
        journey={matchingJourney}
        loading={journey.isLoading}
        error={journey.isError}
        now={now}
        onClose={closePanel}
        paperRef={sheetRef}
        highlightedStopId={focusedStop?.stopId ?? null}
        onStopSelect={focusRouteStop}
        onVehicleSelect={focusVehicle}
      />
      <StopSheet
        stop={selectedStop}
        data={arrivals.data}
        loading={arrivals.isLoading}
        error={arrivals.isError}
        now={now}
        onClose={closeStop}
        paperRef={stopSheetRef}
      />
    </Box>
  )
}

export default App
