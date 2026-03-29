import { useState, useMemo } from 'react'
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
  folder: '\uD83D\uDDC2',
  search: '\uD83D\uDD0D',
  house: '\uD83C\uDFE0',
  page: '\uD83D\uDCC4',
  megaphone: '\uD83D\uDCE2',
  phone: '\uD83D\uDCF1',
  briefcase: '\uD83D\uDCBC',
  headset: '\uD83C\uDFA7',
  money: '\uD83D\uDCB0',
  scales: '\u2696',
  chart: '\uD83D\uDCCA',
  map: '\uD83D\uDDFA',
  people: '\uD83D\uDC65',
  graduation: '\uD83C\uDF93',
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

/** A row of capability tags with a colored left bar */
function CapGroup({ type, items }: { type: 'skill' | 'mcp' | 'tool'; items: string[] }) {
  if (items.length === 0) return null
  const barColor = { skill: 'bg-accent-purple', mcp: 'bg-accent-cyan', tool: 'bg-accent-amber' }[type]
  const tagClass = {
    skill: 'text-accent-purple border-accent-purple/25 bg-accent-purple/8',
    mcp: 'text-accent-cyan border-accent-cyan/25 bg-accent-cyan/8',
    tool: 'text-accent-amber border-accent-amber/25 bg-accent-amber/8',
  }[type]
  return (
    <div className="flex items-stretch gap-0 mb-1 last:mb-0">
      <div className={`w-[3px] shrink-0 ${barColor} mr-1.5`} />
      <div className="flex flex-wrap gap-[3px] py-px">
        {items.map(name => (
          <span
            key={name}
            className={`font-mono text-[8px] leading-[14px] px-[5px] py-px border max-w-[200px] truncate ${tagClass}`}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Detail panel for the selected template */
function TemplateDetail({ template }: { template: ProjectTemplate }) {
  const { t } = useTranslation('templates')
  const icon = ICON_MAP[template.icon] ?? ICON_MAP['star']

  const getSkillName = (refId: string) => template.skills.find(s => s.refId === refId)?.name ?? refId
  const getMCPName = (refId: string) => template.mcpServers.find(m => m.refId === refId)?.name ?? refId
  const getBuiltinTools = (tools?: Record<string, unknown>) => {
    if (!tools) return []
    return Object.entries(tools).filter(([, v]) => !!v).map(([k]) => k)
  }
  const getAgentName = (refId: string) => template.agents.find(a => a.refId === refId)?.name ?? refId

  return (
    <div className="flex flex-col gap-3 overflow-y-auto max-h-[280px] pr-1">
      {/* Header */}
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

      {/* Description */}
      <p className="font-mono text-[11px] text-text-secondary leading-[18px]">
        {t(`projects.${template.id}.description`, { defaultValue: template.description })}
      </p>

      {/* Category + Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <PixelBadge variant={CATEGORY_VARIANTS[template.category]} animated={false}>
          {t(`categories.${template.category}`, { defaultValue: template.category })}
        </PixelBadge>
        <div className="flex gap-3 font-mono text-[10px] text-text-dim">
          {template.agents.length > 0 && <span>{template.agents.length} {t('ui.labelAgents')}</span>}
          {template.skills.length > 0 && <span>{template.skills.length} {t('ui.labelSkills')}</span>}
          {template.mcpServers.length > 0 && <span>{template.mcpServers.length} MCP</span>}
          {template.teams.length > 0 && <span>{template.teams.length} {t('ui.labelTeams')}</span>}
          {template.cronJobs.length > 0 && <span>{template.cronJobs.length} {t('ui.labelAutomations')}</span>}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3.5 font-mono text-[8px] text-text-dim">
        <span className="flex items-center gap-1.5">
          <span className="w-[5px] h-[5px] bg-accent-purple" /> {t('ui.labelSkills')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[5px] h-[5px] bg-accent-cyan" /> MCP
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-[5px] h-[5px] bg-accent-amber" /> {t('ui.labelTools')}
        </span>
      </div>

      {/* Agent cards */}
      {template.agents.length > 0 && (
        <>
          <div className="font-pixel text-[8px] text-text-dim uppercase tracking-wider border-b border-border-dim pb-1">
            {t('ui.sectionAgents')}
          </div>
          <div className="flex flex-col gap-1.5">
            {template.agents.map(agent => {
              const skills = agent.skillRefs?.map(getSkillName) ?? []
              const mcps = agent.mcpRefs?.map(getMCPName) ?? []
              const tools = getBuiltinTools(agent.builtinTools)
              return (
                <div key={agent.refId} className="bg-surface border-2 border-border-dim p-2">
                  <div className="font-pixel text-[8px] text-text-primary mb-1.5">{agent.name}</div>
                  <CapGroup type="skill" items={skills} />
                  <CapGroup type="mcp" items={mcps} />
                  <CapGroup type="tool" items={tools} />
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Teams */}
      {template.teams.length > 0 && (
        <>
          <div className="font-pixel text-[8px] text-text-dim uppercase tracking-wider border-b border-border-dim pb-1">
            {t('ui.sectionTeams')}
          </div>
          {template.teams.map(team => {
            const lead = team.members.find(m => !m.parentAgentRef)
            const children = team.members.filter(m => m.parentAgentRef)
            return (
              <div key={team.refId} className="bg-surface border border-border-dim p-2">
                <div className="font-pixel text-[9px] text-text-primary">{team.name}</div>
                <div className="font-mono text-[9px] text-text-secondary mt-0.5">
                  {lead && <span>{getAgentName(lead.agentRef)}</span>}
                  {children.length > 0 && (
                    <span>
                      {' '}<span className="text-accent-green">{'\u2192'}</span>{' '}
                      {children.map(c => getAgentName(c.agentRef)).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Tags */}
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

  const stats = useMemo(() => ({
    templates: PROJECT_TEMPLATES.length,
    agents: PROJECT_TEMPLATES.reduce((s, tmpl) => s + tmpl.agents.length, 0),
    skills: PROJECT_TEMPLATES.reduce((s, tmpl) => s + tmpl.skills.length, 0),
    mcp: PROJECT_TEMPLATES.reduce((s, tmpl) => s + tmpl.mcpServers.length, 0),
  }), [])

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
    <div className="flex flex-col gap-3" data-testid="template-selector">
      {/* Two creation mode options */}
      <div className="grid grid-cols-2 gap-3">
        <button
          data-testid="template-blank-btn"
          onClick={handleBlankClick}
          className={`text-left p-4 border-2 cursor-pointer transition-colors ${
            !showTemplates
              ? 'bg-accent-green/10 border-accent-green shadow-raised'
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
          data-testid="template-from-template-btn"
          onClick={handleFromTemplateClick}
          className={`text-left p-4 border-2 cursor-pointer transition-colors ${
            showTemplates
              ? 'bg-accent-green/10 border-accent-green shadow-raised'
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
            <p className="font-mono text-[9px] text-accent-green/70 leading-[12px]">
              {t('ui.statsLine', { templates: stats.templates, agents: stats.agents, skills: stats.skills })}
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
                    data-testid="template-category-all"
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
                      data-testid={`template-category-${cat}`}
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
                        data-testid={`template-item-${template.id}`}
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
              <div className="p-4 bg-deep" data-testid="template-detail-panel">
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
