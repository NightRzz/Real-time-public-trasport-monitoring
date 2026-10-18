import { Box } from '@mui/material'
import { useCallback, useRef, useState } from 'react'
import { Header } from './components/Header'
import { LastUpdate } from './components/LastUpdate'
import { MapView } from './components/MapView'
import { VehicleLayer } from './components/VehicleLayer'
import { VehicleStatus } from './components/VehicleStatus'
import { VehicleSheet } from './components/VehicleSheet'
import { RouteLayer } from './components/RouteLayer'
import { useNow } from './hooks/useNow'
import { useVehicles } from './hooks/useVehicles'
import { useVehicleJourney } from './hooks/useVehicleJourney'

function App() {
  const { data, isLoading, error } = useVehicles()
  const now = useNow(5000)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const selected =
    data?.features.find((feature) => feature.properties.vehicle_id === selectedId) ?? null
  const journey = useVehicleJourney(selected, panelOpen)
  const selectVehicle = useCallback((id: number) => {
    setSelectedId(id)
    setPanelOpen(true)
  }, [])
  const closePanel = useCallback(() => setPanelOpen(false), [])
  const matchingJourney =
    journey.data?.route_id === selected?.properties.route_id &&
    journey.data?.trip_id === selected?.properties.trip_id
      ? journey.data
      : undefined

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header />
      <Box component="main" sx={{ flex: 1, position: 'relative' }}>
        <MapView>
          {data && (
            <VehicleLayer
              data={data}
              onSelect={selectVehicle}
              selectedId={panelOpen ? selectedId : null}
            />
          )}
          <RouteLayer
            route={panelOpen && selected ? (matchingJourney?.route ?? null) : null}
            vehicleType={selected?.properties.type}
            sheetRef={sheetRef}
          />
        </MapView>
        <LastUpdate
          lastUpdate={data?.last_update}
          vehicleCount={data?.features.length ?? 0}
          offline={!!error}
          now={now}
        />
        <VehicleStatus isLoading={isLoading} error={error} />
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
      />
    </Box>
  )
}

export default App
