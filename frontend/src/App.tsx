import { Box } from '@mui/material'
import { Header } from './components/Header'
import { MapView } from './components/MapView'

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header />
      <Box component="main" sx={{ flex: 1, position: 'relative' }}>
        <MapView />
      </Box>
    </Box>
  )
}

export default App
