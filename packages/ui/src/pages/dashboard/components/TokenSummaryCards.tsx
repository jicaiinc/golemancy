import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { DashboardSummary } from '@golemancy/shared'
import { PixelCard } from '../../../components'
import { staggerContainer, staggerItem } from '../../../lib/motion'
import { formatTokens } from '../utils'

interface TokenSummaryCardsProps {
  summary: DashboardSummary | null
}

export function TokenSummaryCards({ summary }: TokenSummaryCardsProps) {
  const { t } = useTranslation('dashboard')

  if (!summary) return null

  const cards = [
    { label: t('summary.totalTokens'), value: formatTokens(summary.todayTokens.total), icon: '$>', color: 'text-accent-amber' },
    { label: t('summary.inputTokens'), value: formatTokens(summary.todayTokens.input), icon: '>>', color: 'text-accent-blue' },
    { label: t('summary.outputTokens'), value: formatTokens(summary.todayTokens.output), icon: '<<', color: 'text-accent-emerald' },
    { label: t('summary.apiCalls'), value: summary.todayTokens.callCount.toLocaleString(), icon: '[#]', color: 'text-accent-cyan' },
  ]

  return (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      {...staggerContainer}
      initial="initial"
      animate="animate"
    >
      {cards.map(card => (
        <motion.div key={card.label} {...staggerItem}>
          <PixelCard variant="default" className="text-center py-4 px-3">
            <div className={`font-mono text-[14px] mb-2 ${card.color}`}>{card.icon}</div>
            <div className="font-pixel text-[14px] text-text-primary">{card.value}</div>
            <div className="text-[10px] text-text-dim mt-1">{card.label}</div>
          </PixelCard>
        </motion.div>
      ))}
    </motion.div>
  )
}
