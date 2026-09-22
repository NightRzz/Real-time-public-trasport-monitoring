import { Box } from '@mui/material'
import { Header } from './components/Header'

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header />
      <Box component="main" sx={{ flex: 1, position: 'relative', bgcolor: 'grey.100' }} />
    </Box>
  )
}

export default App
