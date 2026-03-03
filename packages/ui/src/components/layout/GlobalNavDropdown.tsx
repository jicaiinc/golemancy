import { useNavigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PixelDropdown } from '../base'
import { useAppStore } from '../../stores'

export function GlobalNavDropdown() {
  const { t } = useTranslation('nav')
  const navigate = useNavigate()
  const location = useLocation()

  const updateInfo = useAppStore(s => s.updateInfo)
  const skippedVersion = useAppStore(s => s.skippedVersion)
  const notificationsEnabled = useAppStore(s => s.updateNotificationsEnabled)
  const showBadge = updateInfo != null && updateInfo.version !== skippedVersion && notificationsEnabled

  const items = [
    { label: t('global.allProjects'), value: '/', selected: location.pathname === '/' },
    { label: t('global.dashboard'), value: '/dashboard', selected: location.pathname === '/dashboard' },
    { label: t('global.settings'), value: '/settings', selected: location.pathname === '/settings' },
  ]

  return (
    <PixelDropdown
      maxHeight="480px"
      trigger={
        <button className="relative w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-elevated/50 cursor-pointer transition-colors">
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
      onSelect={value => navigate(value)}
      align="right"
    />
  )
}
