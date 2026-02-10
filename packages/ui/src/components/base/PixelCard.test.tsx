import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { PixelCard } from './PixelCard'

describe('PixelCard', () => {
  it('renders children', () => {
    render(<PixelCard>Card content</PixelCard>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('defaults to default variant', () => {
    render(<PixelCard>Default</PixelCard>)
    expect(screen.getByText('Default').className).toContain('bg-surface')
  })

  it.each(['default', 'elevated', 'interactive', 'outlined'] as const)(
    'renders %s variant',
    (variant) => {
      render(<PixelCard variant={variant}>Content</PixelCard>)
      expect(screen.getByText('Content')).toBeInTheDocument()
    },
  )

  it('applies elevated variant classes', () => {
    render(<PixelCard variant="elevated">Elevated</PixelCard>)
    expect(screen.getByText('Elevated').className).toContain('bg-elevated')
  })

  it('applies interactive variant with hover cursor', () => {
    render(<PixelCard variant="interactive">Interactive</PixelCard>)
    expect(screen.getByText('Interactive').className).toContain('cursor-pointer')
  })

  it('applies outlined variant with dashed border', () => {
    render(<PixelCard variant="outlined">Outlined</PixelCard>)
    expect(screen.getByText('Outlined').className).toContain('border-dashed')
  })

  it('applies selected state border', () => {
    render(<PixelCard selected>Selected</PixelCard>)
    expect(screen.getByText('Selected').className).toContain('border-l-accent-green')
  })

  it('does not apply selected border when not selected', () => {
    render(<PixelCard>Not selected</PixelCard>)
    expect(screen.getByText('Not selected').className).not.toContain('border-l-accent-green')
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(<PixelCard ref={ref}>Ref</PixelCard>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('applies custom className', () => {
    render(<PixelCard className="my-class">Custom</PixelCard>)
    expect(screen.getByText('Custom').className).toContain('my-class')
  })
})
