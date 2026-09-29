import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, Typography } from '@mui/material'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>
          Coś poszło nie tak
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Odśwież stronę
        </Button>
      </Box>
    )
  }
}
