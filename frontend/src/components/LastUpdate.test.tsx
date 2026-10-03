import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LastUpdate, STALE_AFTER_MS } from './LastUpdate'

const LAST_UPDATE = '2026-10-03T10:15:30Z'
const FRESH = Date.parse(LAST_UPDATE) + 5000

describe('LastUpdate', () => {
  it('shows time of last update and vehicle count', () => {
    render(<LastUpdate lastUpdate={LAST_UPDATE} vehicleCount={213} offline={false} now={FRESH} />)

    expect(screen.getByText(/213 pojazdów/)).toBeInTheDocument()
    expect(screen.getByText(/\d{2}:15:30/)).toBeInTheDocument()
  })

  it('shows offline state when backend stopped responding', () => {
    render(<LastUpdate lastUpdate={LAST_UPDATE} vehicleCount={213} offline now={FRESH} />)

    expect(screen.getByText(/Offline/)).toBeInTheDocument()
  })

  it('marks data as stale when city api stopped updating', () => {
    const now = Date.parse(LAST_UPDATE) + STALE_AFTER_MS + 1000

    render(<LastUpdate lastUpdate={LAST_UPDATE} vehicleCount={213} offline={false} now={now} />)

    expect(screen.getByText(/Dane nieaktualne/)).toBeInTheDocument()
  })

  it('renders nothing before first data', () => {
    const { container } = render(
      <LastUpdate lastUpdate={null} vehicleCount={0} offline={false} now={FRESH} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
