import { Box } from '@mui/material'
import { Header } from './components/Header'
import { LastUpdate } from './components/LastUpdate'
import { MapView } from './components/MapView'
import { VehicleLayer } from './components/VehicleLayer'
import { VehicleStatus } from './components/VehicleStatus'
import { useNow } from './hooks/useNow'
import { useVehicles } from './hooks/useVehicles'

function App() {
  const { data, isLoading, error } = useVehicles()
  const now = useNow(5000)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header />
      <Box component="main" sx={{ flex: 1, position: 'relative' }}>
        <MapView>{data && <VehicleLayer data={data} />}</MapView>
        <LastUpdate
          lastUpdate={data?.last_update}
          vehicleCount={data?.features.length ?? 0}
          offline={!!error}
          now={now}
        />
        <VehicleStatus isLoading={isLoading} error={error} />
      </Box>
    </Box>
  )
}

export default App
