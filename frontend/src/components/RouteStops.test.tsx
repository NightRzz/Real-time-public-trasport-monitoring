import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { JourneyStop } from '../types/vehicle'
import { RouteStops } from './RouteStops'

const NOW = Date.parse('2026-10-31T15:00:00Z')

function route(passed: number | null, estimates: Record<number, number> = {}): JourneyStop[] {
  return ['A', 'B', 'C', 'D', 'E', 'F'].map((name, index) => ({
    stop_id: index + 1,
    name,
    code: '01',
    estimated_time:
      index in estimates ? new Date(NOW + estimates[index] * 60_000).toISOString() : null,
    passed: passed === null ? null : index < passed,
  }))
}

function view(stops: JourneyStop[], onSelect = vi.fn(), onVehicleSelect = vi.fn(), live = true) {
  render(
    <RouteStops
      stops={stops}
      type="tram"
      live={live}
      now={NOW}
      emptyMessage="Brak aktualnej prognozy dla tego kursu."
      highlightedId={null}
      onSelect={onSelect}
      onVehicleSelect={onVehicleSelect}
    />,
  )
  return onSelect
}

const shown = () =>
  screen.queryAllByRole('button', { pressed: false }).map((row) => row.textContent?.[0])

describe('RouteStops', () => {
  it('shows the last passed stop, the vehicle and the next two stops', () => {
    const onVehicleSelect = vi.fn()
    view(route(3, { 3: 2, 4: 6 }), vi.fn(), onVehicleSelect)

    expect(shown()).toEqual(['C', 'D', 'E'])
    fireEvent.click(screen.getByRole('button', { name: 'Tramwaj jest tutaj' }))
    expect(onVehicleSelect).toHaveBeenCalledOnce()
    expect(screen.getByText('2 min')).toBeInTheDocument()
    expect(screen.getByText('2 przystanki za nami')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('expands to the whole route and reports taps', () => {
    const onSelect = view(route(3))

    expect(screen.getByRole('status')).toHaveTextContent('Brak aktualnej prognozy')
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż całą trasę · 6 przystanków' }))
    expect(shown()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    fireEvent.click(screen.getByRole('button', { name: /^F 01/ }))
    expect(onSelect).toHaveBeenCalledWith(6)
  })

  it('starts at the forecast stop when the vehicle is not placed on the route', () => {
    view(route(null, { 2: 3 }))

    expect(shown()).toEqual(['C', 'D', 'E'])
    expect(screen.queryByText(/jest tutaj/)).not.toBeInTheDocument()
    expect(screen.getByText('2 przystanki wcześniej')).toBeInTheDocument()
  })

  it.each([0, 44, 45, 46])('shows an expired prediction for at most 45 seconds: %s', (seconds) => {
    view(route(3, { 3: -seconds / 60 }))
    expect(screen.queryByText('Za chwilę') !== null).toBe(seconds <= 45)
  })

  it.each([
    { stops: route(null, { 2: -0.5 }), live: true },
    { stops: route(4, { 3: -0.5, 4: 2 }), live: true },
    { stops: route(3, { 3: -0.5 }), live: false },
    { stops: route(3), live: true },
  ])(
    'does not invent an imminent arrival without fresh GPS and a matching forecast',
    ({ stops, live }) => {
      view(stops, vi.fn(), vi.fn(), live)
      expect(screen.queryByText('Za chwilę')).not.toBeInTheDocument()
    },
  )
})
