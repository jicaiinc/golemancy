import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PixelDropdown } from './PixelDropdown'

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

const items = [
  { label: 'Option A', value: 'a' },
  { label: 'Option B', value: 'b', selected: true },
  { label: 'Option C', value: 'c' },
]

describe('PixelDropdown', () => {
  it('renders trigger', () => {
    render(
      <PixelDropdown trigger={<button>Open</button>} items={items} onSelect={() => {}} />,
    )
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('does not show dropdown items by default', () => {
    render(
      <PixelDropdown trigger={<button>Open</button>} items={items} onSelect={() => {}} />,
    )
    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
  })

  it('opens dropdown when trigger is clicked', () => {
    render(
      <PixelDropdown trigger={<button>Open</button>} items={items} onSelect={() => {}} />,
    )
    fireEvent.click(screen.getByText('Open'))
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
    expect(screen.getByText('Option C')).toBeInTheDocument()
  })

  it('closes dropdown when trigger is clicked again', () => {
    render(
      <PixelDropdown trigger={<button>Open</button>} items={items} onSelect={() => {}} />,
    )
    fireEvent.click(screen.getByText('Open'))
    expect(screen.getByText('Option A')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Open'))
    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
  })

  it('calls onSelect and closes when item is clicked', () => {
    const onSelect = vi.fn()
    render(
      <PixelDropdown trigger={<button>Open</button>} items={items} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByText('Open'))
    fireEvent.click(screen.getByText('Option A'))
    expect(onSelect).toHaveBeenCalledWith('a')
    // Dropdown should close after selection
    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
  })

  it('shows checkmark for selected items', () => {
    render(
      <PixelDropdown trigger={<button>Open</button>} items={items} onSelect={() => {}} />,
    )
    fireEvent.click(screen.getByText('Open'))
    // Option B is selected — check for checkmark (rendered as &check; HTML entity)
    const optionB = screen.getByText('Option B').closest('button')!
    expect(optionB.innerHTML).toContain('&amp;check;')
  })

  it('closes when clicking outside', () => {
    render(
      <div>
        <PixelDropdown trigger={<button>Open</button>} items={items} onSelect={() => {}} />
        <div data-testid="outside">outside</div>
      </div>,
    )
    fireEvent.click(screen.getByText('Open'))
    expect(screen.getByText('Option A')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Option A')).not.toBeInTheDocument()
  })
})
