import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PixelToggle } from './PixelToggle'

describe('PixelToggle', () => {
  it('renders unchecked toggle', () => {
    render(<PixelToggle checked={false} onChange={() => {}} />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('renders checked toggle', () => {
    render(<PixelToggle checked={true} onChange={() => {}} />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('applies checked styling', () => {
    render(<PixelToggle checked={true} onChange={() => {}} />)
    const toggle = screen.getByRole('switch')
    expect(toggle.className).toContain('bg-accent-green/20')
  })

  it('applies unchecked styling', () => {
    render(<PixelToggle checked={false} onChange={() => {}} />)
    const toggle = screen.getByRole('switch')
    expect(toggle.className).toContain('bg-deep')
  })

  it('calls onChange with toggled value', () => {
    const onChange = vi.fn()
    render(<PixelToggle checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when checked', () => {
    const onChange = vi.fn()
    render(<PixelToggle checked={true} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn()
    render(<PixelToggle checked={false} onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders disabled state', () => {
    render(<PixelToggle checked={false} onChange={() => {}} disabled />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('renders label when provided', () => {
    render(<PixelToggle checked={false} onChange={() => {}} label="Auto save" />)
    expect(screen.getByText('Auto save')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<PixelToggle checked={false} onChange={() => {}} />)
    expect(container.querySelector('[class*="font-mono"]')).toBeNull()
  })
})
