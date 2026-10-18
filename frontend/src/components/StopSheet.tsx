import { Box, Chip, CircularProgress, Divider, IconButton, Stack, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus'
import TramIcon from '@mui/icons-material/Tram'
import type { RefObject } from 'react'
import type { StopArrivals, StopFeature } from '../types/stop'
import { DetailsSheet } from './DetailsSheet'
import { STALE_AFTER_MS } from './LastUpdate'

export function StopSheet({
  stop,
  data,
  loading,
  error,
  now,
  onClose,
  paperRef,
}: {
  stop: StopFeature | null
  data?: StopArrivals
  loading: boolean
  error: boolean
  now: number
  onClose: () => void
  paperRef: RefObject<HTMLDivElement | null>
}) {
  const props = stop?.properties
  const stale =
    data?.status === 'stale' ||
    data?.arrivals.some((arrival) => now - Date.parse(arrival.updated_at) > STALE_AFTER_MS)
  const arrivals = error
    ? []
    : (data?.arrivals ?? []).filter(
        (arrival) =>
          Date.parse(arrival.time) >= now && now - Date.parse(arrival.updated_at) <= STALE_AFTER_MS,
      )

  return (
    <DetailsSheet open={!!stop} titleId="stop-sheet-title" onClose={onClose} paperRef={paperRef}>
      {props && (
        <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            {props.type !== 'tram' && <DirectionsBusIcon color="secondary" />}
            {props.type !== 'bus' && <TramIcon color="primary" />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography id="stop-sheet-title" component="h2" variant="h6">
                {props.name} {props.code}
              </Typography>
            </Box>
            <IconButton aria-label="Zamknij szczegóły przystanku" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="overline" color="text.secondary">
            Najbliższe odjazdy
          </Typography>
          {loading ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 2 }}>
              <CircularProgress size={18} />
              <Typography>Pobieranie odjazdów…</Typography>
            </Stack>
          ) : arrivals.length ? (
            <Stack divider={<Divider />}>
              {arrivals.map((arrival, index) => {
                const seconds = Math.ceil((Date.parse(arrival.time) - now) / 1000)
                return (
                  <Stack
                    key={`${arrival.line}-${arrival.time}-${index}`}
                    direction="row"
                    spacing={1.5}
                    sx={{ alignItems: 'center', py: 1.5 }}
                  >
                    <Chip
                      label={arrival.line}
                      color={arrival.type === 'tram' ? 'primary' : 'secondary'}
                      sx={{ minWidth: 48, fontWeight: 800 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>{arrival.headsign}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(arrival.time).toLocaleTimeString('pl-PL', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Europe/Warsaw',
                        })}
                        {!arrival.realtime && ' · Rozkład'}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {seconds <= 30 ? 'Za chwilę' : `${Math.ceil(seconds / 60)} min`}
                    </Typography>
                  </Stack>
                )
              })}
            </Stack>
          ) : (
            <Typography role="status" color="text.secondary" sx={{ py: 2 }}>
              {error
                ? 'Nie udało się pobrać odjazdów. Ponawiamy połączenie.'
                : stale
                  ? 'Dane nieaktualne — oczekiwanie na nowe odjazdy.'
                  : data?.status === 'unavailable'
                    ? 'ZTM nie udostępnia teraz odjazdów dla tego przystanku.'
                    : 'Brak najbliższych odjazdów w danych ZTM.'}
            </Typography>
          )}
        </Box>
      )}
    </DetailsSheet>
  )
}
