import { useEffect, useRef, type RefObject } from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus'
import TramIcon from '@mui/icons-material/Tram'
import type { VehicleFeature, VehicleJourney } from '../types/vehicle'
import { STALE_AFTER_MS } from './LastUpdate'

interface VehicleSheetProps {
  open: boolean
  vehicle: VehicleFeature | null
  journey?: VehicleJourney
  loading: boolean
  error: boolean
  now: number
  onClose: () => void
  paperRef: RefObject<HTMLDivElement | null>
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  })
}

export function VehicleSheet({
  open,
  vehicle,
  journey,
  loading,
  error,
  now,
  onClose,
  paperRef,
}: VehicleSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const id = vehicle?.properties.vehicle_id
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const paper = paperRef.current
    closeRef.current?.focus({ preventScroll: true })
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      if (paper?.contains(document.activeElement)) {
        previousFocus?.focus({ preventScroll: true })
      }
    }
  }, [open, id, onClose, paperRef])

  const props = vehicle?.properties
  const stale = !props || now - Date.parse(props.timestamp) > STALE_AFTER_MS
  const next = journey?.next_stop
  const predictionStale = !!next && now - Date.parse(next.prediction_updated_at) > STALE_AFTER_MS
  const seconds = next ? Math.ceil((Date.parse(next.estimated_time) - now) / 1000) : -1
  const hasPrediction = !!next && !error && !stale && !predictionStale && seconds >= 0
  const minutes = Math.ceil(seconds / 60)
  const delay = props?.delay

  return (
    <Drawer
      anchor="bottom"
      variant="persistent"
      open={open}
      slotProps={{
        paper: {
          ref: paperRef,
          role: 'dialog',
          'aria-labelledby': 'vehicle-sheet-title',
          sx: {
            left: 0,
            right: 0,
            mx: 'auto',
            width: '100%',
            maxWidth: 560,
            bottom: { xs: 0, sm: 20 },
            borderRadius: '20px 20px 0 0',
            borderBottomLeftRadius: { sm: 20 },
            borderBottomRightRadius: { sm: 20 },
            boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
            maxHeight: 'min(65dvh, calc(100dvh - 200px))',
            pb: 'env(safe-area-inset-bottom)',
          },
        },
      }}
    >
      {props && (
        <Box sx={{ p: { xs: 2.5, sm: 3 }, pt: 1 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Chip
              icon={props.type === 'tram' ? <TramIcon /> : <DirectionsBusIcon />}
              label={props.line}
              color={props.type === 'tram' ? 'primary' : 'secondary'}
              sx={{ fontWeight: 800, fontSize: 20, height: 44, px: 0.5 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                {props.type === 'tram' ? 'Tramwaj' : 'Autobus'}
                {props.vehicle_code ? ` · ${props.vehicle_code}` : ''}
              </Typography>
              <Typography
                id="vehicle-sheet-title"
                component="h2"
                variant="h6"
                sx={{ lineHeight: 1.25 }}
              >
                {props.headsign || `Linia ${props.line}`}
              </Typography>
            </Box>
            <IconButton ref={closeRef} aria-label="Zamknij szczegóły pojazdu" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 2, minHeight: 98 }} aria-live="polite">
            <Typography variant="overline" color="text.secondary">
              Najbliższy przystanek z prognozą ZTM
            </Typography>
            {loading ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CircularProgress size={16} />
                <Typography>Pobieranie prognozy…</Typography>
              </Stack>
            ) : hasPrediction ? (
              <Stack
                direction="row"
                spacing={2}
                sx={{ alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
                    {next.stop.name}
                    {next.stop.code ? ` ${next.stop.code}` : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Prognoza ZTM · {clockTime(next.estimated_time)}
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontSize: 28,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    color: 'secondary.main',
                  }}
                >
                  {seconds <= 30 ? 'Za chwilę' : `${minutes} min`}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {error || journey?.prediction_status === 'error'
                  ? 'Nie udało się pobrać prognozy. Spróbujemy ponownie za chwilę.'
                  : stale || predictionStale || journey?.prediction_status === 'stale'
                    ? 'Dane nieaktualne — oczekiwanie na nową prognozę.'
                    : 'Brak aktualnej prognozy dla tego kursu.'}
              </Typography>
            )}
          </Box>
          <Stack
            direction="row"
            divider={<Divider orientation="vertical" flexItem />}
            spacing={3}
            sx={{ my: 2 }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                Prędkość
              </Typography>
              <Typography sx={{ fontWeight: 700 }}>
                {stale || props.speed == null ? '—' : `${Math.round(props.speed)} km/h`}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Punktualność
              </Typography>
              <Typography
                sx={{ fontWeight: 700 }}
                color={delay != null && delay > 60 ? 'warning.dark' : 'text.primary'}
              >
                {stale || delay == null
                  ? '—'
                  : Math.abs(delay) < 60
                    ? 'Planowo'
                    : `${Math.round(Math.abs(delay) / 60)} min ${delay > 0 ? 'opóźnienia' : 'przed czasem'}`}
              </Typography>
            </Box>
          </Stack>
          {!loading && journey?.route_status !== 'available' && (
            <Alert severity="info" sx={{ py: 0 }}>
              {journey?.route_status === 'error' || error
                ? 'Nie udało się pobrać trasy. Ponawiamy połączenie.'
                : 'Trasa tego kursu jest obecnie niedostępna.'}
            </Alert>
          )}
        </Box>
      )}
    </Drawer>
  )
}
