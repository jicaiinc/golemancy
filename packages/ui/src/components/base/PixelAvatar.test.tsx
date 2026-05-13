import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PixelAvatar } from './PixelAvatar'

describe('PixelAvatar', () => {
  it('renders with initials', () => {
    render(<PixelAvatar initials="AB" />)
    expect(screen.getByText('AB')).toBeInTheDocument()
  })

  it('truncates initials to 2 characters and uppercases', () => {
    render(<PixelAvatar initials="abc" />)
    expect(screen.getByText('AB')).toBeInTheDocument()
  })

  it('renders image when src is provided', () => {
    const { container } = render(<PixelAvatar src="https://example.com/avatar.png" />)
    const img = container.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.png')
  })

  it('does not render initials when src is provided', () => {
    render(<PixelAvatar src="https://example.com/avatar.png" initials="AB" />)
    expect(screen.queryByText('AB')).not.toBeInTheDocument()
  })

  it.each(['xs', 'sm', 'md', 'lg', 'xl'] as const)(
    'renders %s size',
    (size) => {
      const sizeMap = { xs: 'w-6', sm: 'w-8', md: 'w-10', lg: 'w-14', xl: 'w-[72px]' }
      const { container } = render(<PixelAvatar size={size} initials="T" />)
      expect(container.firstElementChild!.className).toContain(sizeMap[size])
    },
  )

  it('defaults to md size', () => {
    const { container } = render(<PixelAvatar initials="D" />)
    expect(container.firstElementChild!.className).toContain('w-10')
  })

  it('renders status indicator when status is provided', () => {
    const { container } = render(<PixelAvatar initials="S" status="online" />)
    const indicator = container.querySelector('[class*="absolute"]')
    expect(indicator).toBeInTheDocument()
    expect(indicator!.className).toContain('bg-accent-green')
  })

  it('renders offline status', () => {
    const { container } = render(<PixelAvatar initials="S" status="offline" />)
    const indicator = container.querySelector('[class*="absolute"]')
    expect(indicator).toBeInTheDocument()
    expect(indicator!.className).toContain('bg-text-secondary')
  })

  it('renders error status', () => {
    const { container } = render(<PixelAvatar initials="S" status="error" />)
    const indicator = container.querySelector('[class*="absolute"]')
    expect(indicator!.className).toContain('bg-accent-red')
  })

  it('does not render status indicator when no status', () => {
    const { container } = render(<PixelAvatar initials="N" />)
    const indicator = container.querySelector('[class*="absolute"]')
    expect(indicator).toBeNull()
  })
})
