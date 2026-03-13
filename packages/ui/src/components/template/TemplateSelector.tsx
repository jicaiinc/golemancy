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

/** Detail panel for the selected template */
function TemplateDetail({ template }: { template: ProjectTemplate }) {
  const { t } = useTranslation('templates')
  const icon = ICON_MAP[template.icon] ?? ICON_MAP['star']

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[28px] shrink-0">{icon}</span>
        <div>
          <div className="font-pixel text-[11px] text-text-primary">
            {t(`projects.${template.id}.name`, { defaultValue: template.name })}
          </div>
          {template.featured && (
            <span className="font-pixel text-[7px] text-accent-amber">
              {'\u2605'} {t('ui.featured')}
            </span>
          )}
        </div>
      </div>

      <p className="font-mono text-[11px] text-text-secondary leading-[18px]">
        {t(`projects.${template.id}.description`, { defaultValue: template.description })}
      </p>

      <div>
        <PixelBadge variant={CATEGORY_VARIANTS[template.category]}>
          {t(`categories.${template.category}`, { defaultValue: template.category })}
        </PixelBadge>
      </div>

      <div className="flex gap-4 font-mono text-[10px] text-text-dim">
        {template.agents.length > 0 && <span>{template.agents.length} Agents</span>}
        {template.skills.length > 0 && <span>{template.skills.length} Skills</span>}
        {template.mcpServers.length > 0 && <span>{template.mcpServers.length} MCP</span>}
        {template.teams.length > 0 && <span>{template.teams.length} Teams</span>}
      </div>

      {template.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {template.tags.map(tag => (
            <span
              key={tag}
              className="font-mono text-[9px] px-1.5 py-0.5 bg-elevated text-text-dim border border-border-dim"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function TemplateSelector({ selectedTemplateId, onSelect }: TemplateSelectorProps) {
  const { t } = useTranslation('templates')
  const [showTemplates, setShowTemplates] = useState(selectedTemplateId !== null)
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | null>(null)

  const filteredTemplates = categoryFilter
    ? PROJECT_TEMPLATES.filter(tmpl => tmpl.category === categoryFilter)
    : PROJECT_TEMPLATES

  const selectedTemplate = selectedTemplateId
    ? PROJECT_TEMPLATES.find(tmpl => tmpl.id === selectedTemplateId)
    : undefined

  const activeCategories = CATEGORIES.filter(cat =>
    PROJECT_TEMPLATES.some(tmpl => tmpl.category === cat),
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

      {/* Master-Detail split panel */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-[200px_1fr] border-2 border-border-dim min-h-[280px]">
              {/* Left: template list */}
              <div className="border-r-2 border-border-dim flex flex-col">
                {/* Category filter header */}
                <div className="flex gap-1 flex-wrap p-2 border-b-2 border-border-dim bg-deep">
                  <button
                    onClick={() => setCategoryFilter(null)}
                    className={`px-1.5 py-0.5 font-pixel text-[7px] border cursor-pointer transition-colors ${
                      categoryFilter === null
                        ? 'text-accent-green border-accent-green bg-accent-green/8'
                        : 'text-text-dim border-border-dim hover:text-text-secondary hover:border-border-bright'
                    }`}
                  >
                    {t('ui.allCategories')}
                  </button>
                  {activeCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-1.5 py-0.5 font-pixel text-[7px] border cursor-pointer transition-colors ${
                        categoryFilter === cat
                          ? 'text-accent-green border-accent-green bg-accent-green/8'
                          : 'text-text-dim border-border-dim hover:text-text-secondary hover:border-border-bright'
                      }`}
                    >
                      {t(`categories.${cat}`, { defaultValue: cat })}
                    </button>
                  ))}
                </div>

                {/* Scrollable template list */}
                <div className="flex-1 overflow-y-auto max-h-[240px]">
                  {filteredTemplates.map(template => {
                    const icon = ICON_MAP[template.icon] ?? ICON_MAP['star']
                    const isSelected = selectedTemplateId === template.id
                    return (
                      <button
                        key={template.id}
                        onClick={() => onSelect(template.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2.5 border-b border-border-dim text-left cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-accent-green/10 border-l-[3px] border-l-accent-green pl-[7px]'
                            : 'hover:bg-elevated'
                        }`}
                      >
                        <span className="text-[16px] shrink-0">{icon}</span>
                        <span className="font-pixel text-[8px] text-text-primary truncate flex-1">
                          {t(`projects.${template.id}.name`, { defaultValue: template.name })}
                        </span>
                        {template.featured && (
                          <span className="text-[8px] text-accent-amber shrink-0">{'\u2605'}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Right: detail panel */}
              <div className="p-4 bg-deep">
                {selectedTemplate ? (
                  <TemplateDetail template={selectedTemplate} />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="font-mono text-[11px] text-text-dim">
                      {t('ui.selectToPreview')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
