import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DetailsSheet } from './DetailsSheet'

function Panel({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true)
  const paperRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <button onClick={() => setOpen(true)}>Otwórz kurs</button>
      <DetailsSheet
        open={open}
        titleId="trip-title"
        paperRef={paperRef}
        onClose={() => {
          setOpen(false)
          onClose()
        }}
      >
        <h2 id="trip-title">Linia 120</h2>
        <input aria-label="Wybrany przystanek" defaultValue="Dworzec" />
      </DetailsSheet>
    </>
  )
}

describe('DetailsSheet', () => {
  it('collapses without closing or losing the selected trip content', () => {
    const onClose = vi.fn()
    render(<Panel onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Wybrany przystanek'), { target: { value: 'Lotnisko' } })

    fireEvent.click(screen.getByRole('button', { name: 'Zwiń panel' }))

    expect(screen.getByRole('button', { name: 'Rozwiń panel' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByText('Linia 120')).not.toBeVisible()
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Rozwiń panel' }))

    expect(screen.getByText('Linia 120')).toBeVisible()
    expect(screen.getByLabelText('Wybrany przystanek')).toHaveValue('Lotnisko')
    expect(screen.getByRole('button', { name: 'Zwiń panel' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('can close a collapsed panel and opens the next selection expanded', async () => {
    const onClose = vi.fn()
    render(<Panel onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zwiń panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij szczegóły' }))

    expect(onClose).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Otwórz kurs' }))

    expect(screen.getByRole('button', { name: 'Zwiń panel' })).toBeVisible()
    expect(screen.getByText('Linia 120')).toBeVisible()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
