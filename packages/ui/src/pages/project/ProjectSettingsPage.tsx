import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { AgentId, ProjectConfig, ProjectId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelButton, PixelInput, PixelTextArea, PixelCard, PixelTabs, PermissionsSettings } from '../../components'

const ICONS = [
  { id: 'pickaxe', label: '\u26CF' },
  { id: 'sword', label: '\u2694' },
  { id: 'shield', label: '\uD83D\uDEE1' },
  { id: 'book', label: '\uD83D\uDCD6' },
  { id: 'star', label: '\u2B50' },
  { id: 'gem', label: '\uD83D\uDC8E' },
  { id: 'flame', label: '\uD83D\uDD25' },
  { id: 'bolt', label: '\u26A1' },
]

export function ProjectSettingsPage() {
  const { t } = useTranslation('project')
  const { projectId } = useParams<{ projectId: string }>()
  const project = useCurrentProject()
  const updateProject = useAppStore(s => s.updateProject)
  const agents = useAppStore(s => s.agents)
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('general')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('pickaxe')
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const settingsTabs = useMemo(() => [
    { id: 'general', label: t('settings.tabs.general') },
    { id: 'agent', label: t('settings.tabs.agent') },
    { id: 'permissions', label: t('settings.tabs.permissions') },
  ], [t])

  useEffect(() => {
    if (!project) return
    setName(project.name)
    setDescription(project.description)
    setIcon(project.icon)
    setMaxConcurrentAgents(project.config.maxConcurrentAgents)
  }, [project])

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

  if (!project) return null

  const mainAgent = agents.find(a => a.id === project.mainAgentId)

  async function handleMainAgentChange(agentId: AgentId | undefined) {
    if (!project) return
    await updateProject(project.id, { mainAgentId: agentId })
  }

  async function handleSave() {
    if (!project) return
    setSaving(true)
    const config: ProjectConfig = {
      ...project.config,
      maxConcurrentAgents,
    }
    await updateProject(project.id, {
      name: name.trim(),
      description: description.trim(),
      icon,
      config,
    })
    setSaving(false)
    clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className={`p-6 ${activeTab === 'permissions' ? 'max-w-[960px]' : 'max-w-[640px]'}`}>
      <h1 className="font-pixel text-[14px] text-text-primary mb-6">{t('settings.title')}</h1>

      <PixelTabs tabs={settingsTabs} activeTab={activeTab} onTabChange={setActiveTab} testIdPrefix="project-settings" />

      <div className="mt-4">
        {activeTab === 'agent' && (
          <AgentTab
            projectId={projectId!}
            project={project}
            agents={agents}
            mainAgent={mainAgent}
            onMainAgentChange={handleMainAgentChange}
            navigate={navigate}
          />
        )}
        {activeTab === 'general' && (
          <GeneralTab
            project={project}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            icon={icon}
            setIcon={setIcon}
            saving={saving}
            saved={saved}
            onSave={handleSave}
          />
        )}
        {activeTab === 'permissions' && (
          <PermissionsSettings projectId={projectId! as ProjectId} />
        )}
      </div>
    </div>
  )
}

// ========== Agent Tab ==========
function AgentTab({
  projectId,
  project,
  agents,
  mainAgent,
  onMainAgentChange,
  navigate,
}: {
  projectId: string
  project: NonNullable<ReturnType<typeof useCurrentProject>>
  agents: ReturnType<typeof useAppStore.getState>['agents']
  mainAgent: ReturnType<typeof useAppStore.getState>['agents'][number] | undefined
  onMainAgentChange: (agentId: AgentId | undefined) => void
  navigate: ReturnType<typeof useNavigate>
}) {
  const { t } = useTranslation('project')
  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-2">{t('settings.agent.mainLabel')}</div>
        <p className="text-[12px] text-text-dim mb-3">
          {t('settings.agent.mainDesc')}
        </p>

        {agents.length === 0 ? (
          <PixelCard variant="outlined" className="text-center py-4">
            <p className="text-[12px] text-text-dim mb-3">
              {t('settings.agent.noAgents')}
            </p>
            <PixelButton
              variant="primary"
              size="sm"
              onClick={() => navigate(`/projects/${projectId}/agents`)}
            >
              {t('settings.agent.goToAgents')}
            </PixelButton>
          </PixelCard>
        ) : (
          <>
            <select
              value={project.mainAgentId ?? ''}
              onChange={e => onMainAgentChange(
                e.target.value ? e.target.value as AgentId : undefined
              )}
              className="w-full h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
            >
              <option value="">{t('settings.agent.none')}</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            {mainAgent && (
              <PixelButton
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/projects/${projectId}/agents/${mainAgent.id}`)}
              >
                {t('settings.agent.configure')}
              </PixelButton>
            )}
          </>
        )}
      </PixelCard>
    </div>
  )
}

// ========== General Tab ==========
function GeneralTab({
  project,
  name,
  setName,
  description,
  setDescription,
  icon,
  setIcon,
  saving,
  saved,
  onSave,
}: {
  project: NonNullable<ReturnType<typeof useCurrentProject>>
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  icon: string
  setIcon: (v: string) => void
  saving: boolean
  saved: boolean
  onSave: () => void
}) {
  const { t } = useTranslation('project')
  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">{t('settings.general.sectionTitle')}</div>
        <div className="flex flex-col gap-4">
          <CopyableId label={t('label.projectId')} value={project.id} />
          <PixelInput
            label={t('label.projectName')}
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <PixelTextArea
            label={t('label.description')}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
          />
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('label.icon')}</label>
            <div className="flex gap-2">
              {ICONS.map(ic => (
                <button
                  key={ic.id}
                  onClick={() => setIcon(ic.id)}
                  className={`w-10 h-10 flex items-center justify-center text-[18px] border-2 cursor-pointer transition-colors ${
                    icon === ic.id
                      ? 'bg-accent-green/15 border-accent-green'
                      : 'bg-deep border-border-dim hover:border-border-bright'
                  }`}
                >
                  {ic.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PixelCard>

      <div className="flex items-center gap-3">
        <PixelButton variant="primary" data-testid="save-btn" onClick={onSave} disabled={saving || !name.trim()}>
          {saving ? t('common:button.saving') : t('settings.general.saveBtn')}
        </PixelButton>
        {saved && <span className="text-[12px] text-accent-green">{t('settings.savedMsg')}</span>}
      </div>
    </div>
  )
}

// ========== Copyable ID Display ==========
function CopyableId({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation('project')
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    clearTimeout(timerRef.current)
    setCopied(true)
    timerRef.current = setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <div className="flex flex-col gap-1">
      <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{label}</label>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCopy}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCopy() }}
        title={t('settings.clickToCopy')}
        className="group flex items-center gap-2 w-fit px-2 py-1 bg-deep border border-border-dim cursor-pointer select-all hover:border-border-bright transition-colors"
      >
        <span className="font-mono text-[11px] text-text-dim">{value}</span>
        <span className="font-mono text-[10px] text-text-dim/50 group-hover:text-text-dim transition-colors">
          {copied ? '✓' : '⎘'}
        </span>
      </div>
    </div>
  )
}
