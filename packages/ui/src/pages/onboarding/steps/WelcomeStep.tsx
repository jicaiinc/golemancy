import { useTranslation } from 'react-i18next'
import { PixelButton } from '../../../components'
import logoSrc from '../../../assets/logo.png'

// NOTE: Feature grid (8 cards with SVG icons matching golemancy.ai) is available
// but hidden for a minimal welcome experience. Uncomment to restore.
// See git history for the full FEATURES array with NetworkIcon, BotIcon, etc.

interface WelcomeStepProps {
  onGetStarted: () => void
}

export function WelcomeStep({ onGetStarted }: WelcomeStepProps) {
  const { t } = useTranslation('onboarding')

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
      <div className="mt-4">
        <PixelButton variant="primary" size="lg" onClick={onGetStarted}>
          {t('button.getStarted')}
        </PixelButton>
      </div>
    </div>
  )
}
