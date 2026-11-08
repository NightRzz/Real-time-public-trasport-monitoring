import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { StopSheet } from './StopSheet'
import type { StopArrivals, StopFeature } from '../types/stop'
import type { VehicleFeature } from '../types/vehicle'

const NOW = Date.parse('2026-11-08T14:00:00Z')
const stop: StopFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [18.64, 54.35] },
  properties: { stop_id: 1, name: 'Dworzec', code: '01', type: 'tram' },
}
const vehicle: VehicleFeature = {
  type: 'Feature',
  id: 7,
  geometry: { type: 'Point', coordinates: [18.65, 54.36] },
  properties: {
    vehicle_id: 7,
    vehicle_code: '1007',
    route_id: 8,
    trip_id: 11,
    scheduled_trip_start_time: new Date(NOW - 600_000).toISOString(),
    line: '8',
    type: 'tram',
    headsign: 'Jelitkowo',
    speed: 20,
    direction: 90,
    delay: 0,
    timestamp: new Date(NOW).toISOString(),
  },
}
const arrival: StopArrivals['arrivals'][number] = {
  vehicle_id: 7,
  route_id: 8,
  trip_id: 11,
  scheduled_trip_start_time: vehicle.properties.scheduled_trip_start_time,
  line: '8',
  type: 'tram',
  headsign: 'Jelitkowo',
  time: new Date(NOW + 120_000).toISOString(),
  realtime: true,
  updated_at: new Date(NOW).toISOString(),
}

function view(update: Partial<typeof arrival> = {}, vehicles = [vehicle]) {
  const onVehicleSelect = vi.fn()
  render(
    <StopSheet
      stop={stop}
      data={{ status: 'available', arrivals: [{ ...arrival, ...update }] }}
      loading={false}
      error={false}
      now={NOW}
      onClose={vi.fn()}
      paperRef={createRef()}
      vehicles={vehicles}
      onVehicleSelect={onVehicleSelect}
    />,
  )
  return onVehicleSelect
}

describe('StopSheet departure selection', () => {
  it('selects the exact vehicle serving the departure', () => {
    const onVehicleSelect = view()
    fireEvent.click(screen.getByRole('button', { name: /Pokaż pojazd/ }))
    expect(onVehicleSelect).toHaveBeenCalledWith(7)
  })

  it.each([
    { vehicle_id: 99 },
    { route_id: 9 },
    { trip_id: 12 },
    { scheduled_trip_start_time: new Date(NOW).toISOString() },
    { scheduled_trip_start_time: null },
    { realtime: false },
  ])('does not guess a vehicle for an unmatched or scheduled departure: %j', (update) => {
    const onVehicleSelect = view(update)
    const row = screen.getByRole('button', { name: /Pozycja niedostępna/ })
    expect(row).toBeDisabled()
    fireEvent.click(row)
    expect(onVehicleSelect).not.toHaveBeenCalled()
  })

  it('does not navigate to an outdated GPS position', () => {
    view({}, [
      {
        ...vehicle,
        properties: { ...vehicle.properties, timestamp: new Date(NOW - 120_000).toISOString() },
      },
    ])
    expect(screen.getByRole('button', { name: /Pozycja niedostępna/ })).toBeDisabled()
  })

  it.each([0, 44, 45, 46])(
    'keeps a live departure for at most 45 seconds after its ETA: %s',
    (seconds) => {
      view({ time: new Date(NOW - seconds * 1000).toISOString() })
      expect(screen.queryByText('Za chwilę') !== null).toBe(seconds <= 45)
    },
  )

  it('does not keep expired scheduled departures', () => {
    view({ time: new Date(NOW - 10_000).toISOString(), realtime: false })
    expect(screen.queryByText('Za chwilę')).not.toBeInTheDocument()
  })

  it('does not keep expired departures for a different trip', () => {
    view({ time: new Date(NOW - 10_000).toISOString(), trip_id: 99 })
    expect(screen.queryByText('Za chwilę')).not.toBeInTheDocument()
  })

  it.each([
    { vehicles: [] as VehicleFeature[] },
    {
      vehicles: [
        {
          ...vehicle,
          properties: { ...vehicle.properties, timestamp: new Date(NOW - 120_000).toISOString() },
        },
      ],
    },
  ])('does not keep expired departures without fresh GPS', ({ vehicles }) => {
    view({ time: new Date(NOW - 10_000).toISOString() }, vehicles)
    expect(screen.queryByText('Za chwilę')).not.toBeInTheDocument()
  })
})
