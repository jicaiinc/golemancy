import type { TimeRange } from '@golemancy/shared'
import { PixelButton } from '../../../components'

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All Time' },
]

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-1">
      {OPTIONS.map(opt => (
        <PixelButton
          key={opt.value}
          size="sm"
          variant={value === opt.value ? 'primary' : 'ghost'}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </PixelButton>
      ))}
    </div>
  )
}
