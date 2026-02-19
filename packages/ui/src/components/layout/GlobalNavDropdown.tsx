import { useNavigate, useLocation } from 'react-router'
import { PixelDropdown } from '../base'

const NAV_ITEMS = [
  { label: 'All Projects', value: '/' },
  { label: 'Dashboard', value: '/dashboard' },
  { label: 'Settings', value: '/settings' },
]

export function GlobalNavDropdown() {
  const navigate = useNavigate()
  const location = useLocation()

  const items = NAV_ITEMS.map(item => ({
    ...item,
    selected: location.pathname === item.value,
  }))

  return (
    <PixelDropdown
      maxHeight="480px"
      trigger={
        <button className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-elevated/50 cursor-pointer transition-colors">
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="text-current">
            <rect y="0" width="16" height="2" fill="currentColor" />
            <rect y="5" width="16" height="2" fill="currentColor" />
            <rect y="10" width="16" height="2" fill="currentColor" />
          </svg>
        </button>
      }
      items={items}
      onSelect={value => navigate(value)}
      align="right"
    />
  )
}
