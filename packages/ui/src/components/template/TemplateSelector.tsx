import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { PROJECT_TEMPLATES } from '@golemancy/shared'
import type { ProjectTemplate, TemplateCategory } from '@golemancy/shared'
import { PixelBadge } from '../base'

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

const CATEGORIES: TemplateCategory[] = ['starter', 'productivity', 'research', 'creative', 'development']

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

/** Compact card for the grid — icon + name + featured star */
function CompactCard({
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
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-2 cursor-pointer transition-colors ${
        selected
          ? 'bg-accent-green/10 border-accent-green'
          : 'bg-surface border-border-dim hover:bg-elevated hover:border-border-bright'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[16px] shrink-0">{icon}</span>
        <span className="font-pixel text-[9px] text-text-primary truncate flex-1">
          {t(`projects.${template.id}.name`, { defaultValue: template.name })}
        </span>
        {template.featured && (
          <span className="font-pixel text-[8px] text-accent-amber shrink-0">{'\u2605'}</span>
        )}
      </div>
    </button>
  )
}

/** Detail panel shown below grid when a template is selected */
function TemplateDetail({ template }: { template: ProjectTemplate }) {
  const { t } = useTranslation('templates')
  const icon = ICON_MAP[template.icon] ?? ICON_MAP['star']

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="p-3 border-2 border-accent-green/30 bg-accent-green/5"
    >
      <div className="flex items-start gap-3">
        <span className="text-[20px] mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-pixel text-[10px] text-text-primary">
              {t(`projects.${template.id}.name`, { defaultValue: template.name })}
            </span>
            {template.featured && (
              <span className="font-pixel text-[7px] text-accent-amber">
                {t('ui.featured')}
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-text-dim leading-[14px]">
            {t(`projects.${template.id}.description`, { defaultValue: template.description })}
          </p>
          <div className="mt-2">
            <PixelBadge variant={CATEGORY_VARIANTS[template.category]}>
              {t(`categories.${template.category}`, { defaultValue: template.category })}
            </PixelBadge>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function TemplateSelector({ selectedTemplateId, onSelect }: TemplateSelectorProps) {
  const { t } = useTranslation('templates')
  const [showTemplates, setShowTemplates] = useState(selectedTemplateId !== null)
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | null>(null)

  const filteredTemplates = categoryFilter
    ? PROJECT_TEMPLATES.filter(t => t.category === categoryFilter)
    : PROJECT_TEMPLATES

  const selectedTemplate = selectedTemplateId
    ? PROJECT_TEMPLATES.find(t => t.id === selectedTemplateId)
    : undefined

  // Gather which categories actually have templates
  const activeCategories = CATEGORIES.filter(cat =>
    PROJECT_TEMPLATES.some(t => t.category === cat),
  )

  function handleBlankClick() {
    setShowTemplates(false)
    onSelect(null)
  }

  function handleFromTemplateClick() {
    setShowTemplates(true)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Two creation mode options */}
      <div className="grid grid-cols-2 gap-3">
        {/* Blank Project */}
        <button
          onClick={handleBlankClick}
          className={`text-left p-4 border-2 cursor-pointer transition-colors ${
            !showTemplates
              ? 'bg-accent-green/10 border-accent-green shadow-pixel-raised'
              : 'bg-surface border-border-dim hover:bg-elevated hover:border-border-bright'
          }`}
        >
          <div className="flex flex-col gap-2">
            <span className="text-[24px]">{ICON_MAP['pickaxe']}</span>
            <span className="font-pixel text-[10px] text-text-primary">
              {t('ui.blankProject')}
            </span>
            <p className="font-mono text-[10px] text-text-dim leading-[14px]">
              {t('ui.blankProjectDescription')}
            </p>
          </div>
        </button>

        {/* From Template */}
        <button
          onClick={handleFromTemplateClick}
          className={`text-left p-4 border-2 cursor-pointer transition-colors ${
            showTemplates
              ? 'bg-accent-green/10 border-accent-green shadow-pixel-raised'
              : 'bg-surface border-border-dim hover:bg-elevated hover:border-border-bright'
          }`}
        >
          <div className="flex flex-col gap-2">
            <span className="text-[24px]">{ICON_MAP['scroll']}</span>
            <span className="font-pixel text-[10px] text-text-primary">
              {t('ui.fromTemplate')}
            </span>
            <p className="font-mono text-[10px] text-text-dim leading-[14px]">
              {t('ui.fromTemplateDescription')}
            </p>
          </div>
        </button>
      </div>

      {/* Template browser (expanded when "From Template" is active) */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-1">
              {/* Category filter tabs */}
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setCategoryFilter(null)}
                  className={`px-2 py-1 font-pixel text-[8px] border-2 cursor-pointer transition-colors ${
                    categoryFilter === null
                      ? 'bg-accent-green/15 border-accent-green text-accent-green'
                      : 'bg-surface border-border-dim text-text-dim hover:text-text-secondary hover:border-border-bright'
                  }`}
                >
                  {t('ui.allCategories')}
                </button>
                {activeCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2 py-1 font-pixel text-[8px] border-2 cursor-pointer transition-colors ${
                      categoryFilter === cat
                        ? 'bg-accent-green/15 border-accent-green text-accent-green'
                        : 'bg-surface border-border-dim text-text-dim hover:text-text-secondary hover:border-border-bright'
                    }`}
                  >
                    {t(`categories.${cat}`, { defaultValue: cat })}
                  </button>
                ))}
              </div>

              {/* Compact template grid */}
              <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto">
                {filteredTemplates.map(template => (
                  <CompactCard
                    key={template.id}
                    template={template}
                    selected={selectedTemplateId === template.id}
                    onClick={() => onSelect(template.id)}
                  />
                ))}
              </div>

              {/* Selected template detail */}
              {selectedTemplate && <TemplateDetail template={selectedTemplate} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
