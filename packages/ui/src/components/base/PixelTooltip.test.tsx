import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PixelTooltip } from './PixelTooltip'

describe('PixelTooltip', () => {
  it('renders children', () => {
    render(
      <PixelTooltip content="Tooltip text">
        <button>Hover me</button>
      </PixelTooltip>,
    )
    expect(screen.getByText('Hover me')).toBeInTheDocument()
  })

  it('does not show tooltip by default', () => {
    render(
      <PixelTooltip content="Hidden">
        <button>Hover</button>
      </PixelTooltip>,
    )
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('shows tooltip on mouse enter', () => {
    render(
      <PixelTooltip content="Visible">
        <button>Hover</button>
      </PixelTooltip>,
    )
    fireEvent.mouseEnter(screen.getByText('Hover').parentElement!)
    expect(screen.getByText('Visible')).toBeInTheDocument()
  })

  it('hides tooltip on mouse leave', () => {
    render(
      <PixelTooltip content="Disappear">
        <button>Hover</button>
      </PixelTooltip>,
    )
    const container = screen.getByText('Hover').parentElement!
    fireEvent.mouseEnter(container)
    expect(screen.getByText('Disappear')).toBeInTheDocument()
    fireEvent.mouseLeave(container)
    expect(screen.queryByText('Disappear')).not.toBeInTheDocument()
  })

  it('defaults to top position', () => {
    render(
      <PixelTooltip content="Top">
        <button>Hover</button>
      </PixelTooltip>,
    )
    fireEvent.mouseEnter(screen.getByText('Hover').parentElement!)
    const tooltip = screen.getByText('Top')
    expect(tooltip.className).toContain('bottom-full')
  })

  it('supports bottom position', () => {
    render(
      <PixelTooltip content="Bottom" position="bottom">
        <button>Hover</button>
      </PixelTooltip>,
    )
    fireEvent.mouseEnter(screen.getByText('Hover').parentElement!)
    const tooltip = screen.getByText('Bottom')
    expect(tooltip.className).toContain('top-full')
  })
})
