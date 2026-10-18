import { Paper, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export function Header({ children }: { children?: ReactNode }) {
  return (
    <Paper
      component="header"
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        flexShrink: 0,
        gap: 0.5,
        px: { xs: 2, sm: 3 },
        py: 1.25,
        borderRadius: 0,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="h6" component="h1" sx={{ fontWeight: 700, lineHeight: 1.4 }}>
        Gdańsk · Komunikacja
      </Typography>
      {children}
    </Paper>
  )
}
