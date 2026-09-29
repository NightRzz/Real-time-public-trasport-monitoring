import { Box } from '@mui/material'
import { Header } from './components/Header'
import { MapView } from './components/MapView'
import { VehicleStatus } from './components/VehicleStatus'
import { useVehicles } from './hooks/useVehicles'

function App() {
  const { isLoading, error } = useVehicles()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header />
      <Box component="main" sx={{ flex: 1, position: 'relative' }}>
        <MapView />
        <VehicleStatus isLoading={isLoading} error={error} />
      </Box>
    </Box>
  )
}

export default App
