import { useTranslation } from 'react-i18next'
import { PixelButton } from '../../../components'

interface Props {
  onResetLayout: () => void
}

export function TopologyToolbar({ onResetLayout }: Props) {
  const { t } = useTranslation('agent')
  return (
    <div className="absolute top-3 right-3 z-10 flex gap-2">
      <PixelButton variant="ghost" size="sm" onClick={onResetLayout}>
        {t('topology.resetLayout')}
      </PixelButton>
    </div>
  )
}
