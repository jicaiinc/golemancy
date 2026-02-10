import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { PixelButton } from './PixelButton'

describe('PixelButton', () => {
  it('renders children', () => {
    render(<PixelButton>Click me</PixelButton>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('defaults to secondary variant and md size', () => {
    render(<PixelButton>Default</PixelButton>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-elevated')
    expect(btn.className).toContain('h-9')
  })

  it.each(['primary', 'secondary', 'danger', 'ghost', 'link'] as const)(
    'renders %s variant',
    (variant) => {
      render(<PixelButton variant={variant}>{variant}</PixelButton>)
      expect(screen.getByRole('button')).toBeInTheDocument()
    },
  )

  it('applies primary variant classes', () => {
    render(<PixelButton variant="primary">Go</PixelButton>)
    expect(screen.getByRole('button').className).toContain('bg-accent-green')
  })

  it('applies danger variant classes', () => {
    render(<PixelButton variant="danger">Delete</PixelButton>)
    expect(screen.getByRole('button').className).toContain('bg-accent-red')
  })

  it.each(['sm', 'md', 'lg'] as const)('renders %s size', (size) => {
    const sizeMap = { sm: 'h-7', md: 'h-9', lg: 'h-11' }
    render(<PixelButton size={size}>{size}</PixelButton>)
    expect(screen.getByRole('button').className).toContain(sizeMap[size])
  })

  it('handles click events', () => {
    const onClick = vi.fn()
    render(<PixelButton onClick={onClick}>Click</PixelButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders disabled state', () => {
    const onClick = vi.fn()
    render(<PixelButton disabled onClick={onClick}>Disabled</PixelButton>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn.className).toContain('opacity-40')
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<PixelButton ref={ref}>Ref</PixelButton>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('applies custom className', () => {
    render(<PixelButton className="custom-class">Custom</PixelButton>)
    expect(screen.getByRole('button').className).toContain('custom-class')
  })
})
