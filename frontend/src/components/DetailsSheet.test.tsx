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

  it('resizes with the handle and restores the chosen height after collapsing', () => {
    render(<Panel />)
    const sheet = screen.getByRole('dialog')
    const handle = screen.getByRole('button', { name: 'Zwiń panel' })
    handle.setPointerCapture = vi.fn()
    vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)

    fireEvent.pointerDown(handle, { clientY: 400, button: 0, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 250, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    fireEvent.click(handle)

    expect(sheet).toHaveStyle({ height: '550px' })
    expect(screen.getByText('Linia 120')).toBeVisible()
    vi.mocked(sheet.getBoundingClientRect).mockReturnValue({ height: 550 } as DOMRect)
    fireEvent.click(handle)
    fireEvent.click(screen.getByRole('button', { name: 'Rozwiń panel' }))
    expect(sheet).toHaveStyle({ height: '550px' })
  })

  it('limits upward dragging and collapses near the bottom', () => {
    const onClose = vi.fn()
    render(<Panel onClose={onClose} />)
    const sheet = screen.getByRole('dialog')
    const handle = screen.getByRole('button', { name: 'Zwiń panel' })
    handle.setPointerCapture = vi.fn()
    vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)

    fireEvent.pointerDown(handle, { clientY: 400, button: 0, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: -1000, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    fireEvent.click(handle)
    expect(sheet).toHaveStyle({ height: `${window.innerHeight - 96}px` })

    fireEvent.pointerDown(handle, { clientY: 400, button: 0, pointerId: 2 })
    fireEvent.pointerMove(handle, { clientY: 900, pointerId: 2 })
    fireEvent.pointerUp(handle, { pointerId: 2 })
    fireEvent.click(handle)
    expect(screen.getByRole('button', { name: 'Rozwiń panel' })).toBeVisible()
    expect(screen.getByText('Linia 120')).not.toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps resizing on the handle, leaving content gestures alone', () => {
    render(<Panel />)
    const sheet = screen.getByRole('dialog')
    fireEvent.pointerDown(screen.getByText('Linia 120'), { clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerMove(screen.getByText('Linia 120'), { clientY: 500, pointerId: 1 })
    fireEvent.pointerUp(screen.getByText('Linia 120'), { pointerId: 1 })
    expect(sheet).toHaveStyle({ height: 'min(65dvh, calc(100dvh - 96px))' })
    expect(screen.getByText('Linia 120')).toBeVisible()
  })
})
