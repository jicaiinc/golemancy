import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PixelProgress } from './PixelProgress'

describe('PixelProgress', () => {
  it('renders progress bar with correct width', () => {
    const { container } = render(<PixelProgress value={50} />)
    const bar = container.querySelector('[class*="bg-accent-green"]') as HTMLElement
    expect(bar.style.width).toBe('50%')
  })

  it('clamps value to minimum 0', () => {
    const { container } = render(<PixelProgress value={-20} />)
    const bar = container.querySelector('[class*="bg-accent-green"]') as HTMLElement
    expect(bar.style.width).toBe('0%')
  })

  it('clamps value to maximum 100', () => {
    const { container } = render(<PixelProgress value={150} />)
    const bar = container.querySelector('[class*="bg-accent-green"]') as HTMLElement
    expect(bar.style.width).toBe('100%')
  })

  it('renders 0% progress', () => {
    const { container } = render(<PixelProgress value={0} />)
    const bar = container.querySelector('[class*="bg-accent-green"]') as HTMLElement
    expect(bar.style.width).toBe('0%')
  })

  it('renders 100% progress', () => {
    const { container } = render(<PixelProgress value={100} />)
    const bar = container.querySelector('[class*="bg-accent-green"]') as HTMLElement
    expect(bar.style.width).toBe('100%')
  })

  it('applies custom className', () => {
    const { container } = render(<PixelProgress value={50} className="w-full" />)
    expect(container.firstElementChild!.className).toContain('w-full')
  })
})
