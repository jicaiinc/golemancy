import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { PROJECT_TEMPLATES } from '@golemancy/shared'
import type { ProjectTemplate, TemplateCategory } from '@golemancy/shared'
import { PixelBadge } from '../base'
import { staggerContainer, staggerItem } from '../../lib/motion'

const ICON_MAP: Record<string, string> = {
  pickaxe: '\u26CF',
  sword: '\u2694',
  shield: '\uD83D\uDEE1',
  book: '\uD83D\uDCD6',
  star: '\u2B50',
  gem: '\uD83D\uDC8E',
  flame: '\uD83D\uDD25',
  bolt: '\u26A1',
  compass: '\uD83E\uDDED',
  scroll: '\uD83D\uDCDC',
  globe: '\uD83C\uDF10',
  wrench: '\uD83D\uDD27',
  palette: '\uD83C\uDFA8',
  beaker: '\u2697',
}

const CATEGORY_VARIANTS: Record<TemplateCategory, 'info' | 'success' | 'paused' | 'error' | 'idle'> = {
  starter: 'idle',
  productivity: 'success',
  research: 'info',
  creative: 'paused',
  development: 'idle',
}

interface TemplateSelectorProps {
  selectedTemplateId: string | null
  onSelect: (templateId: string | null) => void
}

function TemplateCard({
  template,
  selected,
  onClick,
}: {
  template: ProjectTemplate
  selected: boolean
  onClick: () => void
}) {
  const { t } = useTranslation('templates')
  const icon = ICON_MAP[template.icon] ?? ICON_MAP['star']

  return (
    <motion.button
      {...staggerItem}
      onClick={onClick}
      className={`w-full text-left p-3 border-2 cursor-pointer transition-colors ${
        selected
          ? 'bg-accent-green/10 border-accent-green'
          : 'bg-surface border-border-dim hover:bg-elevated hover:border-border-bright'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-[20px] mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-pixel text-[10px] text-text-primary truncate">
              {t(`projects.${template.id}.name`, { defaultValue: template.name })}
            </span>
            {template.featured && (
              <span className="font-pixel text-[7px] text-accent-amber">
                {t('ui.featured')}
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-text-dim leading-[14px] line-clamp-2">
            {t(`projects.${template.id}.description`, { defaultValue: template.description })}
          </p>
          <div className="mt-2">
            <PixelBadge variant={CATEGORY_VARIANTS[template.category]}>
              {t(`categories.${template.category}`, { defaultValue: template.category })}
            </PixelBadge>
          </div>
        </div>
      </div>
    </motion.button>
  )
}

export function TemplateSelector({ selectedTemplateId, onSelect }: TemplateSelectorProps) {
  const { t } = useTranslation('templates')

  return (
    <div className="flex flex-col gap-3">
      <span className="font-pixel text-[9px] text-text-secondary">
        {t('ui.chooseTemplate')}
      </span>

      <motion.div {...staggerContainer} className="grid grid-cols-1 gap-2">
        {/* Blank Project option */}
        <motion.button
          {...staggerItem}
          onClick={() => onSelect(null)}
          className={`w-full text-left p-3 border-2 cursor-pointer transition-colors ${
            selectedTemplateId === null
              ? 'bg-accent-green/10 border-accent-green'
              : 'bg-surface border-border-dim hover:bg-elevated hover:border-border-bright'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-[20px] mt-0.5 shrink-0">{ICON_MAP['pickaxe']}</span>
            <div className="flex-1 min-w-0">
              <span className="font-pixel text-[10px] text-text-primary">
                {t('ui.blankProject')}
              </span>
              <p className="font-mono text-[10px] text-text-dim leading-[14px] mt-1">
                {t('ui.blankProjectDescription')}
              </p>
            </div>
          </div>
        </motion.button>

        {/* Template cards */}
        {PROJECT_TEMPLATES.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={selectedTemplateId === template.id}
            onClick={() => onSelect(template.id)}
          />
        ))}
      </motion.div>
    </div>
  )
}
