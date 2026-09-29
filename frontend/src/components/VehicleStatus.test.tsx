import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VehicleStatus } from './VehicleStatus'

describe('VehicleStatus', () => {
  it('shows progress bar while loading', () => {
    render(<VehicleStatus isLoading error={null} />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows alert when backend is down', () => {
    render(<VehicleStatus isLoading={false} error={new Error('Network Error')} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się pobrać pozycji pojazdów')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
