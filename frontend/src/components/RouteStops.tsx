import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Box, Button, ButtonBase, Typography } from '@mui/material'
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import TramIcon from '@mui/icons-material/Tram'
import type { JourneyStop, VehicleType } from '../types/vehicle'

const COMPACT_ROWS = 3
const PASSED_COLOR = 'grey.400'

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  })
}

function stopCount(count: number) {
  const ones = count % 10
  const tens = count % 100
  if (count === 1) return '1 przystanek'
  return `${count} ${ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? 'przystanki' : 'przystanków'}`
}

function Rail({ top, bottom, children }: { top?: string; bottom?: string; children: ReactNode }) {
  const segment = { position: 'absolute', left: 9, width: 4 } as const
  return (
    <Box sx={{ position: 'relative', alignSelf: 'stretch', display: 'grid', placeItems: 'center' }}>
      {top && <Box sx={{ ...segment, top: 0, bottom: '50%', bgcolor: top }} />}
      {bottom && <Box sx={{ ...segment, top: '50%', bottom: 0, bgcolor: bottom }} />}
      <Box sx={{ position: 'relative', display: 'grid' }}>{children}</Box>
    </Box>
  )
}

interface RouteStopsProps {
  stops: JourneyStop[]
  type: VehicleType
  /** False when the vehicle position or its forecasts are too old to show times. */
  live: boolean
  now: number
  emptyMessage: string
  highlightedId: number | null
  onSelect: (stopId: number) => void
  onVehicleSelect: () => void
}

export function RouteStops({
  stops,
  type,
  live,
  now,
  emptyMessage,
  highlightedId,
  onSelect,
  onVehicleSelect,
}: RouteStopsProps) {
  const [expanded, setExpanded] = useState(false)
  const listRef = useRef<HTMLOListElement>(null)
  const color = type === 'tram' ? 'primary.main' : 'secondary.main'
  const located = stops.some((stop) => stop.passed !== null)
  const passed = stops.filter((stop) => stop.passed).length
  const timed = stops.map(
    (stop) =>
      live && !stop.passed && !!stop.estimated_time && Date.parse(stop.estimated_time) >= now,
  )
  const lead = timed.indexOf(true)
  const anchor = located ? passed : Math.max(lead, 0)
  const start = expanded
    ? 0
    : Math.max(0, Math.min(located ? anchor - 1 : anchor, stops.length - COMPACT_ROWS))
  const end = expanded ? stops.length : start + COMPACT_ROWS

  useEffect(() => {
    const list = listRef.current
    const target = list?.querySelector<HTMLElement>('[data-anchor]')
    if (expanded && list && target) list.scrollTop = target.offsetTop - list.clientHeight / 2
  }, [expanded])

  const vehicleRow = (
    <li data-anchor>
      <ButtonBase
        onClick={onVehicleSelect}
        sx={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '22px minmax(0, 1fr)',
          columnGap: 1.25,
          justifyContent: 'start',
          textAlign: 'left',
          borderRadius: 1,
        }}
      >
        <Rail
          top={passed > 0 ? PASSED_COLOR : undefined}
          bottom={passed < stops.length ? color : undefined}
        >
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: 2,
              borderColor: 'background.paper',
              bgcolor: color,
              color: 'common.white',
              display: 'grid',
              placeItems: 'center',
              '& svg': { fontSize: 13 },
            }}
          >
            {type === 'tram' ? <TramIcon /> : <DirectionsBusIcon />}
          </Box>
        </Rail>
        <Typography variant="caption" color="text.secondary" sx={{ py: 0.5 }}>
          {type === 'tram' ? 'Tramwaj' : 'Autobus'} jest tutaj
        </Typography>
      </ButtonBase>
    </li>
  )

  return (
    <Box>
      {lead < 0 && (
        <Typography role="status" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {emptyMessage}
        </Typography>
      )}
      <Box
        component="ol"
        ref={listRef}
        aria-label="Przystanki kursu"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          position: 'relative',
          ...(expanded && { maxHeight: '34dvh', overflowY: 'auto' }),
        }}
      >
        {start > 0 && (
          <li>
            <ButtonBase
              onClick={() => setExpanded(true)}
              sx={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '22px minmax(0, 1fr)',
                columnGap: 1.25,
                justifyContent: 'start',
                textAlign: 'left',
                borderRadius: 1,
              }}
            >
              <Rail bottom={stops[start].passed ? PASSED_COLOR : color}>
                <Box sx={{ height: 28 }} />
              </Rail>
              <Typography variant="body2" color="text.secondary">
                {stopCount(start)} {located ? 'za nami' : 'wcześniej'}
              </Typography>
            </ButtonBase>
          </li>
        )}
        {stops.slice(start, end).map((stop, offset) => {
          const index = start + offset
          const segment = stop.passed ? PASSED_COLOR : color
          const seconds = stop.estimated_time
            ? Math.ceil((Date.parse(stop.estimated_time) - now) / 1000)
            : 0
          const highlighted = stop.stop_id === highlightedId
          return (
            <Fragment key={`${stop.stop_id}-${index}`}>
              {located && index === passed && vehicleRow}
              <Box component="li" {...(!located && index === anchor && { 'data-anchor': true })}>
                <ButtonBase
                  aria-pressed={highlighted}
                  onClick={() => onSelect(stop.stop_id)}
                  sx={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '22px minmax(0, 1fr) auto',
                    columnGap: 1.25,
                    alignItems: 'center',
                    textAlign: 'left',
                    pr: 1,
                    borderRadius: 1,
                    bgcolor: highlighted ? 'action.selected' : undefined,
                  }}
                >
                  <Rail
                    top={index > 0 || (located && index === passed) ? segment : undefined}
                    bottom={index < stops.length - 1 ? segment : undefined}
                  >
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        border: 3,
                        borderColor: segment,
                        bgcolor: 'background.paper',
                      }}
                    />
                  </Rail>
                  <Box sx={{ minWidth: 0, py: 1 }}>
                    <Typography
                      noWrap
                      sx={{
                        fontWeight: index === lead ? 700 : 400,
                        color: stop.passed ? 'text.disabled' : 'text.primary',
                      }}
                    >
                      {stop.name}
                      {stop.code ? ` ${stop.code}` : ''}
                    </Typography>
                    {index === lead && (
                      <Typography variant="body2" color="text.secondary">
                        Prognoza ZTM · {clockTime(stop.estimated_time!)}
                      </Typography>
                    )}
                  </Box>
                  {index === lead ? (
                    <Typography sx={{ fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap', color }}>
                      {seconds < 60 ? '<1m' : `${Math.ceil(seconds / 60)} min`}
                    </Typography>
                  ) : timed[index] ? (
                    <Typography sx={{ fontWeight: 600 }}>
                      {clockTime(stop.estimated_time!)}
                    </Typography>
                  ) : (
                    !stop.passed && <Typography color="text.disabled">—</Typography>
                  )}
                </ButtonBase>
              </Box>
            </Fragment>
          )
        })}
        {located && passed === stops.length && vehicleRow}
      </Box>
      {stops.length > COMPACT_ROWS && (
        <Button
          size="small"
          fullWidth
          aria-expanded={expanded}
          aria-label={expanded ? 'Zwiń trasę' : `Pokaż całą trasę · ${stopCount(stops.length)}`}
          onClick={() => setExpanded((open) => !open)}
          sx={{ mt: 1 }}
        >
          {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        </Button>
      )}
    </Box>
  )
}
