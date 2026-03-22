import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PixelButton, CloseSmallIcon } from '../../components'
import { useAppStore } from '../../stores'
import { GlobalSettingsContent } from './GlobalSettingsPage'

export function GlobalSettingsOverlay() {
  const { t } = useTranslation(['settings', 'common'])
  const navigate = useNavigate()
  const settings = useAppStore(s => s.settings)

  if (!settings) return null

  const handleDismiss = useCallback(() => {
    navigate(-1)
  }, [navigate])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleDismiss()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleDismiss])

  return (
    <section
      aria-label={t('settings:page.title')}
      className="fixed inset-x-0 top-12 bottom-0 z-40 bg-void border-t-2 border-border-bright shadow-[0_-4px_0_0_rgba(0,0,0,0.45)]"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-3 border-b-2 border-border-dim bg-deep px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-pixel text-[12px] text-text-primary">{t('settings:page.title')}</h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PixelButton size="sm" variant="ghost" onClick={handleDismiss}>
              {t('common:button.back')}
            </PixelButton>
            <button
              type="button"
              aria-label={t('common:button.close')}
              onClick={handleDismiss}
              className="flex h-8 w-8 items-center justify-center border-2 border-border-dim bg-surface text-text-secondary transition-colors hover:border-border-bright hover:text-text-primary"
            >
              <CloseSmallIcon />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <GlobalSettingsContent
            showPageTitle={false}
            containerClassName="max-w-[1100px] mx-auto p-6 pb-8"
          />
        </div>
      </div>
    </section>
  )
}
