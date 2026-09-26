import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapView } from './MapView'

const mapMock = vi.hoisted(() => ({
  Map: vi.fn(function () {
    return { addControl: vi.fn(), remove: vi.fn() }
  }),
  NavigationControl: vi.fn(),
}))

vi.mock('maplibre-gl', () => mapMock)

describe('MapView', () => {
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
})
