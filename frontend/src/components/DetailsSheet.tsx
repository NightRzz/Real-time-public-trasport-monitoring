import { useEffect, type ReactNode, type RefObject } from 'react'
import { Drawer } from '@mui/material'

export function DetailsSheet({
  open,
  titleId,
  onClose,
  paperRef,
  children,
}: {
  open: boolean
  titleId: string
  onClose: () => void
  paperRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const paper = paperRef.current
    paper?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      if (paper?.contains(document.activeElement) || document.activeElement === document.body) {
        previousFocus?.focus({ preventScroll: true })
      }
    }
  }, [open, onClose, paperRef])

  return (
    <Drawer
      anchor="bottom"
      variant="persistent"
      open={open}
      slotProps={{
        paper: {
          ref: paperRef,
          role: 'dialog',
          'aria-labelledby': titleId,
          sx: {
            left: 0,
            right: 0,
            mx: 'auto',
            width: '100%',
            maxWidth: 560,
            bottom: { xs: 0, sm: 20 },
            borderRadius: '20px 20px 0 0',
            borderBottomLeftRadius: { sm: 20 },
            borderBottomRightRadius: { sm: 20 },
            boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
            maxHeight: 'min(65dvh, calc(100dvh - 200px))',
            pb: 'env(safe-area-inset-bottom)',
          },
        },
      }}
    >
      {children}
    </Drawer>
  )
}
