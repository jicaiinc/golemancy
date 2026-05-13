import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PixelSpinner } from './PixelSpinner'

describe('PixelSpinner', () => {
  it('renders three dots', () => {
    const { container } = render(<PixelSpinner />)
    const dots = container.querySelectorAll('[class*="w-2"][class*="h-2"]')
    expect(dots).toHaveLength(3)
  })

  it('renders label when provided', () => {
    render(<PixelSpinner label="Loading..." />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<PixelSpinner />)
    expect(container.querySelector('[class*="font-pixel"]')).toBeNull()
  })

  it.each(['sm', 'md', 'lg'] as const)('renders %s size', (size) => {
    const sizeMap = { sm: 'text-[8px]', md: 'text-[10px]', lg: 'text-[14px]' }
    const { container } = render(<PixelSpinner size={size} />)
    const dotsContainer = container.querySelector('[class*="flex items-center"]')
    expect(dotsContainer!.className).toContain(sizeMap[size])
  })

  it('defaults to md size', () => {
    const { container } = render(<PixelSpinner />)
    const dotsContainer = container.querySelector('[class*="flex items-center"]')
    expect(dotsContainer!.className).toContain('text-[10px]')
  })
})
