import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PixelModal } from './PixelModal'

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

describe('PixelModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    title: 'Test Modal',
    children: <p>Modal content</p>,
  }

  it('renders when open', () => {
    render(<PixelModal {...defaultProps} />)
    expect(screen.getByText('Test Modal')).toBeInTheDocument()
    expect(screen.getByText('Modal content')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<PixelModal {...defaultProps} open={false} />)
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument()
  })

  it('renders title', () => {
    render(<PixelModal {...defaultProps} title="My Title" />)
    expect(screen.getByText('My Title')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(
      <PixelModal {...defaultProps}>
        <span>Inner content</span>
      </PixelModal>,
    )
    expect(screen.getByText('Inner content')).toBeInTheDocument()
  })

  it('renders footer when provided', () => {
    render(
      <PixelModal {...defaultProps} footer={<button>Save</button>} />,
    )
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('does not render footer when not provided', () => {
    render(<PixelModal {...defaultProps} />)
    // No footer element expected
    const footerRegion = screen.queryByText('Save')
    expect(footerRegion).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<PixelModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('\u00d7'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<PixelModal {...defaultProps} onClose={onClose} />)
    // The backdrop is the first div with bg-black/70
    const backdrop = container.querySelector('[class*="bg-black"]')
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(<PixelModal {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not respond to Escape when closed', () => {
    const onClose = vi.fn()
    render(<PixelModal {...defaultProps} open={false} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
