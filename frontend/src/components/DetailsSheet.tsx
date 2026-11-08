import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { Box, ButtonBase, Drawer, IconButton } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'

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
  const [collapsed, setCollapsed] = useState(false)
  const contentId = `${titleId}-content`

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
        transition: { onExited: () => setCollapsed(false) },
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
      <Box sx={{ display: 'flex', flexShrink: 0 }}>
        <ButtonBase
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          sx={{ flex: 1, minHeight: 44, gap: 1, color: 'text.secondary', typography: 'body2' }}
        >
          {collapsed ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          {collapsed ? 'Rozwiń panel' : 'Zwiń panel'}
        </ButtonBase>
        {collapsed && (
          <IconButton
            aria-label="Zamknij szczegóły"
            onClick={onClose}
            sx={{ width: 44, height: 44 }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </Box>
      <div id={contentId} hidden={collapsed}>
        {children}
      </div>
    </Drawer>
  )
}
