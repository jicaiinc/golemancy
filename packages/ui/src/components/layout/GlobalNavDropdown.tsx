import { useNavigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PixelDropdown } from '../base'
import { GearIcon } from '../base/PixelIcons'
import { useAppStore } from '../../stores'

export function GlobalNavDropdown() {
  const { t } = useTranslation('nav')
  const navigate = useNavigate()
  const location = useLocation()

  const updateState = useAppStore(s => s.updateState)
  const notificationsEnabled = useAppStore(s => s.updateNotificationsEnabled)
  const showBadge = updateState != null
    && (updateState.status === 'downloaded' || updateState.status === 'available')
    && notificationsEnabled

  const items = [
    { label: t('global.allProjects'), value: '/', selected: location.pathname === '/' },
    { label: t('global.dashboard'), value: '/dashboard', selected: location.pathname === '/dashboard' },
    {
      label: (
        <span className="flex items-center gap-2">
          <GearIcon className="h-[14px] w-[14px] shrink-0 text-text-dim" />
          <span>{t('global.settings')}</span>
        </span>
      ),
      value: '/settings',
    },
  ]

  const handleSelect = (value: string) => {
    if (value === '/settings') {
      const settingsRouteOpen = typeof window !== 'undefined'
        && /^#\/settings(?:[?#]|$)/.test(window.location.hash)

      if (settingsRouteOpen) return
      navigate(value, { state: { backgroundLocation: location } })
      return
    }

    navigate(value)
  }

  return (
    <PixelDropdown
      maxHeight="480px"
      trigger={
        <button
          type="button"
          aria-label="Open navigation menu"
          className="relative w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-elevated/50 cursor-pointer transition-colors"
        >
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="text-current">
            <rect y="0" width="16" height="2" fill="currentColor" />
            <rect y="5" width="16" height="2" fill="currentColor" />
            <rect y="10" width="16" height="2" fill="currentColor" />
          </svg>
          {showBadge && (
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-accent-green" />
          )}
        </button>
      }
      items={items}
      onSelect={handleSelect}
      dividerAfter={[1]}
      align="right"
    />
  )
}
