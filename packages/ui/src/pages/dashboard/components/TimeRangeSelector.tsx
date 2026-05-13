import { useTranslation } from 'react-i18next'
import type { TimeRange } from '@golemancy/shared'
import { PixelButton } from '../../../components'

const OPTIONS: { value: TimeRange; tKey: string }[] = [
  { value: 'today', tKey: 'timeRange.today' },
  { value: '7d', tKey: 'timeRange.sevenDays' },
  { value: '30d', tKey: 'timeRange.thirtyDays' },
  { value: 'all', tKey: 'timeRange.allTime' },
]

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="flex gap-1">
      {OPTIONS.map(opt => (
        <PixelButton
          key={opt.value}
          size="sm"
          variant={value === opt.value ? 'primary' : 'ghost'}
          onClick={() => onChange(opt.value)}
        >
          {t(opt.tKey)}
        </PixelButton>
      ))}
    </div>
  )
}
