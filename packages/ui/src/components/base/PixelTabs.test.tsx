import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PixelTabs } from './PixelTabs'

const tabs = [
  { id: 'tab1', label: 'General' },
  { id: 'tab2', label: 'Config' },
  { id: 'tab3', label: 'Agents' },
]

describe('PixelTabs', () => {
  it('renders all tabs', () => {
    render(<PixelTabs tabs={tabs} activeTab="tab1" onTabChange={() => {}} />)
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Config')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('applies active style to current tab', () => {
    render(<PixelTabs tabs={tabs} activeTab="tab1" onTabChange={() => {}} />)
    const activeBtn = screen.getByText('General')
    expect(activeBtn.className).toContain('text-text-primary')
    expect(activeBtn.className).toContain('bg-surface')
  })

  it('applies inactive style to non-active tabs', () => {
    render(<PixelTabs tabs={tabs} activeTab="tab1" onTabChange={() => {}} />)
    const inactiveBtn = screen.getByText('Config')
    expect(inactiveBtn.className).toContain('text-text-secondary')
    expect(inactiveBtn.className).toContain('bg-deep')
  })

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn()
    render(<PixelTabs tabs={tabs} activeTab="tab1" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByText('Config'))
    expect(onTabChange).toHaveBeenCalledWith('tab2')
  })

  it('renders tab with icon', () => {
    const tabsWithIcon = [
      { id: 'tab1', label: 'Home', icon: <span data-testid="icon">*</span> },
    ]
    render(<PixelTabs tabs={tabsWithIcon} activeTab="tab1" onTabChange={() => {}} />)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })
})
