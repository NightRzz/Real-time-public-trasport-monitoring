import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MapView } from './MapView'

const handlers: Record<string, () => void> = {}

const mapMock = vi.hoisted(() => ({
  Map: vi.fn(function () {
    return {
      addControl: vi.fn(),
      setStyle: vi.fn(),
      remove: vi.fn(),
      on: (event: string, cb: () => void) => {
        handlers[event] = cb
      },
      getCenter: () => ({ lng: 18.6, lat: 54.4 }),
      getZoom: () => 14,
    }
  }),
  NavigationControl: vi.fn(),
  setWorkerUrl: vi.fn(),
}))

vi.mock('maplibre-gl', () => mapMock)

describe('MapView', () => {
  beforeEach(() => {
    mapMock.Map.mockClear()
  })

  it('is centered on gdansk by default', () => {
    render(<MapView />)

    expect(mapMock.Map).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [18.6466, 54.352], zoom: 12 }),
    )
  })

  it('creates map with given view', () => {
    render(<MapView center={[18, 54]} zoom={10} />)

    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(mapMock.Map).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: [18, 54], zoom: 10 }),
    )
  })

  it('reports view after zoom or pan', () => {
    const onViewChange = vi.fn()
    render(<MapView onViewChange={onViewChange} />)

    handlers.moveend()

    expect(onViewChange).toHaveBeenCalledWith({ center: [18.6, 54.4], zoom: 14 })
  })

  it('renders children only after map is loaded', () => {
    render(
      <MapView>
        <span>layer</span>
      </MapView>,
    )

    expect(screen.queryByText('layer')).not.toBeInTheDocument()
    act(() => handlers.load())
    expect(screen.getByText('layer')).toBeInTheDocument()
  })

  it('shows warning when map style fails to load', () => {
    render(<MapView />)

    act(() => handlers.error())

    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się załadować mapy')
  })

  it('ignores tile errors after map is loaded', () => {
    render(<MapView />)

    act(() => handlers.load())
    act(() => handlers.error())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
