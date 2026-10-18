import { Stack, Typography } from '@mui/material'
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
    <Stack
      direction="row"
      spacing={0.75}
      sx={{
        alignItems: 'center',
        ml: 'auto',
        color: warning ? 'warning.dark' : 'text.secondary',
        '& .MuiSvgIcon-root': { fontSize: 16 },
      }}
    >
      {icon}
      <Typography variant="caption">{label}</Typography>
    </Stack>
  )
}
