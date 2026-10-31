import { Paper, Typography } from '@mui/material'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import UpdateIcon from '@mui/icons-material/Update'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'

export const STALE_AFTER_MS = 90_000

interface LastUpdateProps {
  lastUpdate: string | null | undefined
  vehicleCount: number
  offline: boolean
  now: number
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function LastUpdate({ lastUpdate, vehicleCount, offline, now }: LastUpdateProps) {
  if (!lastUpdate) return null

  const time = formatTime(lastUpdate)
  const stale = now - Date.parse(lastUpdate) > STALE_AFTER_MS

  let label = `${time} · ${vehicleCount} pojazdów`
  let icon = <UpdateIcon />
  if (offline) {
    label = `Offline · ostatnie dane ${time}`
    icon = <CloudOffIcon />
  } else if (stale) {
    label = `Dane nieaktualne · ostatnie ${time}`
    icon = <WarningAmberIcon />
  }
  const warning = offline || stale

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        // Matches the MapLibre zoom control in the opposite corner.
        boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.1)',
        color: warning ? 'warning.dark' : 'text.secondary',
        '& .MuiSvgIcon-root': { fontSize: 16 },
      }}
    >
      {icon}
      <Typography variant="caption">{label}</Typography>
    </Paper>
  )
}
