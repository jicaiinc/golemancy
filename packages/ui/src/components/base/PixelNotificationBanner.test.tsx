import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PixelNotificationBanner } from './PixelNotificationBanner'

describe('PixelNotificationBanner', () => {
  it('renders children text', () => {
    render(<PixelNotificationBanner severity="error">Something failed</PixelNotificationBanner>)
    expect(screen.getByText('Something failed')).toBeInTheDocument()
  })

  it('applies error severity classes', () => {
    render(<PixelNotificationBanner severity="error">Error</PixelNotificationBanner>)
    const banner = screen.getByRole('alert')
    expect(banner.className).toContain('accent-red')
  })

  it('applies warning severity classes', () => {
    render(<PixelNotificationBanner severity="warning">Warning</PixelNotificationBanner>)
    const banner = screen.getByRole('alert')
    expect(banner.className).toContain('accent-amber')
  })

  it('applies info severity classes', () => {
    render(<PixelNotificationBanner severity="info">Info</PixelNotificationBanner>)
    const banner = screen.getByRole('alert')
    expect(banner.className).toContain('accent-blue')
  })

  it('applies success severity classes', () => {
    render(<PixelNotificationBanner severity="success">Success</PixelNotificationBanner>)
    const banner = screen.getByRole('alert')
    expect(banner.className).toContain('accent-green')
  })

  it('renders dismiss button when onDismiss is provided', () => {
    render(<PixelNotificationBanner severity="error" onDismiss={() => {}}>Msg</PixelNotificationBanner>)
    expect(screen.getByTitle('Dismiss')).toBeInTheDocument()
  })

  it('does not render dismiss button when onDismiss is not provided', () => {
    render(<PixelNotificationBanner severity="error">Msg</PixelNotificationBanner>)
    expect(screen.queryByTitle('Dismiss')).not.toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<PixelNotificationBanner severity="error" onDismiss={onDismiss}>Msg</PixelNotificationBanner>)
    fireEvent.click(screen.getByTitle('Dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
