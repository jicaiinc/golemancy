import { Component, type ReactNode, type ErrorInfo } from 'react'
import { PixelButton } from './base'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex items-center justify-center h-screen bg-void">
        <div className="text-center max-w-[400px] p-8">
          {/* Pixel Creeper face */}
          <div className="font-mono text-accent-green text-[10px] leading-[10px] mb-6 select-none">
            <pre>{`
  ████████████████
  ██  ████  ████
  ██  ████  ████
  ████  ████  ████
  ██████    ██████
  ██  ████████  ██
  ██  ██    ██  ██
  ████        ████
  ████████████████
            `.trim()}</pre>
          </div>

          <h1 className="font-pixel text-[14px] text-accent-red mb-2">Something Exploded</h1>
          <p className="text-[12px] text-text-secondary mb-4">
            A wild error appeared! Don&apos;t worry, your data is safe.
          </p>

          {this.state.error && (
            <div className="bg-deep border-2 border-accent-red/30 p-3 mb-4 text-left">
              <span className="font-pixel text-[8px] text-accent-red">ERROR</span>
              <p className="text-[11px] text-text-primary font-mono mt-1">
                {this.state.error.message}
              </p>
            </div>
          )}

          <PixelButton variant="primary" onClick={this.handleReset}>
            Try Again
          </PixelButton>
        </div>
      </div>
    )
  }
}
