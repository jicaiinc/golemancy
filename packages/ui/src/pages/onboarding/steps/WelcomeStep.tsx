import { useTranslation } from 'react-i18next'
import { PixelButton } from '../../../components'
import { PixelDropdown } from '../../../components/base/PixelDropdown'
import { LANGUAGES } from '../../../i18n/languages'
import logoSrc from '../../../assets/logo.png'

// NOTE: Feature grid (8 cards with SVG icons matching golemancy.ai) is available
// but hidden for a minimal welcome experience. Uncomment to restore.
// See git history for the full FEATURES array with NetworkIcon, BotIcon, etc.

interface WelcomeStepProps {
  onGetStarted: () => void
  onLanguageChange: (lang: string) => void
}

export function WelcomeStep({ onGetStarted, onLanguageChange }: WelcomeStepProps) {
  const { t, i18n } = useTranslation('onboarding')

  const languageOptions = LANGUAGES.map(lang => ({
    ...lang,
    selected: i18n.language === lang.value,
  }))

  return (
    <div className="flex flex-col items-center justify-center gap-5 text-center min-h-[50vh]">
      <img src={logoSrc} alt="Golemancy" className="w-16 h-16" />
      <span className="font-pixel text-[9px] text-text-dim tracking-widest">
        {t('welcome.tagline')}
      </span>
      <h1 className="font-pixel text-[22px] text-accent-green leading-relaxed">
        {t('welcome.heading')}
      </h1>
      <p className="font-mono text-[13px] text-text-secondary">
        {t('welcome.description')}
      </p>
      <PixelDropdown
        trigger={
          <PixelButton variant="ghost" className="min-w-[160px] text-left justify-between">
            <span className="font-mono text-[12px]">
              {languageOptions.find(o => o.value === i18n.language)?.label ?? 'English'}
            </span>
            <span className="ml-2 text-text-dim">{'\u25BC'}</span>
          </PixelButton>
        }
        items={languageOptions}
        onSelect={onLanguageChange}
      />
      <div className="mt-2">
        <PixelButton variant="primary" size="lg" onClick={onGetStarted}>
          {t('button.getStarted')}
        </PixelButton>
      </div>
    </div>
  )
}
