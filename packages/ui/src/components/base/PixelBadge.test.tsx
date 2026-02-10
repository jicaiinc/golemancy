import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PixelBadge } from './PixelBadge'

describe('PixelBadge', () => {
  it('renders children', () => {
    render(<PixelBadge>Status</PixelBadge>)
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('defaults to idle variant', () => {
    render(<PixelBadge>Idle</PixelBadge>)
    const badge = screen.getByText('Idle').closest('span')!
    expect(badge.className).toContain('bg-elevated')
  })

  it.each(['idle', 'running', 'error', 'paused', 'success', 'info'] as const)(
    'renders %s variant',
    (variant) => {
      render(<PixelBadge variant={variant}>{variant}</PixelBadge>)
      expect(screen.getByText(variant)).toBeInTheDocument()
    },
  )

  it('applies running variant classes', () => {
    render(<PixelBadge variant="running">Running</PixelBadge>)
    const badge = screen.getByText('Running').closest('span')!
    expect(badge.className).toContain('text-accent-green')
  })

  it('applies error variant classes', () => {
    render(<PixelBadge variant="error">Error</PixelBadge>)
    const badge = screen.getByText('Error').closest('span')!
    expect(badge.className).toContain('text-accent-red')
  })

  it('renders status dot', () => {
    const { container } = render(<PixelBadge variant="running">Active</PixelBadge>)
    const dot = container.querySelector('span > span:first-child')
    expect(dot).toBeInTheDocument()
    expect(dot!.className).toContain('w-1.5')
  })

  it('applies custom className', () => {
    render(<PixelBadge className="extra">Test</PixelBadge>)
    const badge = screen.getByText('Test').closest('span')!
    expect(badge.className).toContain('extra')
  })
})
