import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
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
  const [height, setHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const preferredHeight = useRef<number | null>(null)
  const drag = useRef<{ y: number; height: number; last: number; moved: boolean } | null>(null)
  const collapsed = height === 44

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current
    if (!start || !dragging) return
    const delta = start.y - event.clientY
    if (!start.moved && Math.abs(delta) < 5) return
    start.moved = true
    start.last = Math.max(44, Math.min(window.innerHeight - 96, start.height + delta))
    setHeight(start.last)
  }

  const finish = () => {
    setDragging(false)
    const start = drag.current
    if (!start?.moved) return
    if (start.last < 76) {
      if (start.height > 44) preferredHeight.current = start.height
      setHeight(44)
    } else {
      preferredHeight.current = start.last
    }
  }

  const toggle = () => {
    if (drag.current?.moved) {
      drag.current = null
      return
    }
    if (!collapsed)
      preferredHeight.current = paperRef.current?.getBoundingClientRect().height || null
    setHeight(collapsed ? preferredHeight.current : 44)
  }
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
        transition: {
          onEntered: () => paperRef.current?.style.removeProperty('transition'),
          onExited: () => {
            if (collapsed) setHeight(preferredHeight.current)
          },
        },
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
            height: collapsed
              ? 'calc(44px + env(safe-area-inset-bottom))'
              : (height ?? 'min(65dvh, calc(100dvh - 96px))'),
            maxHeight: 'calc(100dvh - 96px)',
            overflow: 'hidden',
            transition: dragging ? 'none' : 'height 220ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            pb: 'env(safe-area-inset-bottom)',
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', flexShrink: 0 }}>
        <ButtonBase
          onClick={toggle}
          title="Przeciągnij, aby zmienić wysokość panelu"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            const current = paperRef.current?.getBoundingClientRect().height || 44
            drag.current = { y: event.clientY, height: current, last: current, moved: false }
            event.currentTarget.setPointerCapture(event.pointerId)
            setDragging(true)
          }}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={() => {
            drag.current = null
            setDragging(false)
          }}
          onLostPointerCapture={() => setDragging(false)}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          sx={{
            flex: 1,
            minHeight: 44,
            gap: 1,
            color: 'text.secondary',
            typography: 'body2',
            touchAction: 'none',
            cursor: dragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
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
      <Box
        id={contentId}
        hidden={collapsed}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}
      >
        {children}
      </Box>
    </Drawer>
  )
}
