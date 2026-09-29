import { Alert, LinearProgress, Snackbar } from '@mui/material'

interface VehicleStatusProps {
  isLoading: boolean
  error: Error | null
}

export function VehicleStatus({ isLoading, error }: VehicleStatusProps) {
  return (
    <>
      {isLoading && (
        <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }} />
      )}
      <Snackbar open={!!error} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" variant="filled">
          Nie udało się pobrać pozycji pojazdów. Sprawdź połączenie z serwerem.
        </Alert>
      </Snackbar>
    </>
  )
}
