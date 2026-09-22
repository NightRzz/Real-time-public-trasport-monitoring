import { AppBar, Toolbar, Typography } from '@mui/material'
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus'

export function Header() {
  return (
    <AppBar position="static" elevation={1}>
      <Toolbar variant="dense">
        <DirectionsBusIcon sx={{ mr: 1 }} />
        <Typography variant="h6" component="h1" noWrap>
          Gdańsk na żywo
        </Typography>
      </Toolbar>
    </AppBar>
  )
}
