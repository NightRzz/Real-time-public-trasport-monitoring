import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Header } from './Header'

describe('Header', () => {
  it('shows app title', () => {
    render(<Header />)
    expect(screen.getByRole('heading', { name: 'Gdańsk · Komunikacja' })).toBeInTheDocument()
  })
})
