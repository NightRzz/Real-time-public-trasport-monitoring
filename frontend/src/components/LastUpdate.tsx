import { Chip } from '@mui/material'
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
    <Chip
      icon={icon}
      label={label}
      color={warning ? 'warning' : 'default'}
      size="small"
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 1,
        bgcolor: warning ? undefined : 'background.paper',
        boxShadow: 1,
      }}
    />
  )
}
