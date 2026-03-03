import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { AgentId, ProjectConfig, ProjectEmbeddingConfig, EmbeddingProviderConfig, EmbeddingProviderType, ProjectId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelButton, PixelInput, PixelTextArea, PixelCard, PixelTabs, PermissionsSettings } from '../../components'
import { getServices } from '../../services'

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
    { id: 'embedding', label: t('settings.tabs.embedding') },
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
        {activeTab === 'embedding' && (
          <ProjectEmbeddingTab project={project} />
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

// ========== Project Embedding Tab ==========
const OPENAI_EMBED_MODELS = ['text-embedding-3-small', 'text-embedding-3-large']

function ProjectEmbeddingTab({ project }: {
  project: NonNullable<ReturnType<typeof useCurrentProject>>
}) {
  const { t } = useTranslation(['project', 'settings'])
  const settings = useAppStore(s => s.settings)
  const updateProject = useAppStore(s => s.updateProject)
  const hasKBVectorData = useAppStore(s => s.hasKBVectorData)

  const globalEmbedding = settings?.embedding
  const projectEmbedding = project.config.embedding
  const customDefaults = projectEmbedding?.custom

  const customRef = useRef<EmbeddingProviderConfig>({
    providerType: customDefaults?.providerType ?? 'openai',
    model: customDefaults?.model || 'text-embedding-3-small',
    apiKey: customDefaults?.apiKey,
    baseUrl: customDefaults?.baseUrl,
    testStatus: customDefaults?.testStatus,
  })

  const [mode, setMode] = useState<'default' | 'custom'>(projectEmbedding?.mode ?? 'default')
  const [providerType, setProviderType] = useState<EmbeddingProviderType>(customDefaults?.providerType ?? 'openai')
  const [model, setModel] = useState(customDefaults?.model || 'text-embedding-3-small')
  const [apiKey, setApiKey] = useState(customDefaults?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(customDefaults?.baseUrl ?? '')
  const [showKey, setShowKey] = useState(false)
  const [locked, setLocked] = useState(false)
  const [useCustomModel, setUseCustomModel] = useState(
    customDefaults?.providerType === 'openai-compatible' || (!!customDefaults?.model && !OPENAI_EMBED_MODELS.includes(customDefaults.model)),
  )
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const [testLatency, setTestLatency] = useState(0)

  const testStatus = customDefaults?.testStatus ?? 'untested'
  const isCustomProvider = providerType === 'openai-compatible'

  useEffect(() => {
    hasKBVectorData().then(setLocked).catch(() => setLocked(false))
  }, [hasKBVectorData])

  // Keep ref in sync
  useEffect(() => {
    customRef.current = {
      providerType,
      model,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      testStatus: projectEmbedding?.custom?.testStatus,
    }
  }, [providerType, model, apiKey, baseUrl, projectEmbedding?.custom?.testStatus])

  // Global summary
  const globalSummary = globalEmbedding
    ? `${globalEmbedding.providerType === 'openai-compatible' ? 'Custom' : 'OpenAI'} / ${globalEmbedding.model}`
    : null
  const globalConfigured = globalEmbedding?.testStatus === 'ok'

  const save = useCallback(
    async (patch: Partial<EmbeddingProviderConfig>) => {
      const current = customRef.current
      const updated: EmbeddingProviderConfig = { ...current, ...patch }
      customRef.current = updated
      await updateProject(project.id, {
        config: { ...project.config, embedding: { mode: 'custom', custom: updated } },
      })
    },
    [updateProject, project],
  )

  async function handleModeChange(newMode: 'default' | 'custom') {
    setMode(newMode)
    if (newMode === 'default') {
      await updateProject(project.id, {
        config: { ...project.config, embedding: { mode: 'default' } },
      })
    } else {
      await updateProject(project.id, {
        config: { ...project.config, embedding: { mode: 'custom', custom: customRef.current } },
      })
    }
  }

  async function handleProviderTypeChange(type: EmbeddingProviderType) {
    setProviderType(type)
    const patch: Partial<EmbeddingProviderConfig> = { providerType: type, testStatus: 'untested' }
    if (type === 'openai-compatible') {
      setUseCustomModel(true)
    } else {
      setUseCustomModel(false)
      setBaseUrl('')
      patch.baseUrl = undefined
      if (!OPENAI_EMBED_MODELS.includes(model)) {
        const newModel = OPENAI_EMBED_MODELS[0]
        setModel(newModel)
        patch.model = newModel
      }
    }
    await save(patch)
  }

  async function handleModelSelect(value: string) {
    if (value === '__custom__') {
      setUseCustomModel(true)
    } else {
      setModel(value)
      await save({ model: value, testStatus: 'untested' })
    }
  }

  async function handleApiKeyBlur() { await save({ apiKey: apiKey.trim() || undefined, testStatus: 'untested' }) }
  async function handleBaseUrlBlur() { await save({ baseUrl: baseUrl.trim() || undefined, testStatus: 'untested' }) }
  async function handleCustomModelBlur() { if (model.trim()) await save({ model: model.trim(), testStatus: 'untested' }) }

  const runTest = useCallback(async () => {
    setTesting(true)
    setTestError('')
    try {
      const result = await getServices().settings.testEmbedding({
        apiKey: apiKey.trim(),
        model,
        baseUrl: baseUrl.trim() || undefined,
        providerType,
      })
      if (result.ok) {
        setTestLatency(result.latencyMs ?? 0)
        await save({ testStatus: 'ok' })
      } else {
        setTestError(result.error ?? t('settings:embedding.test.unknownError'))
        await save({ testStatus: 'error' })
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : t('settings:embedding.test.failed'))
      await save({ testStatus: 'error' })
    } finally {
      setTesting(false)
    }
  }, [apiKey, baseUrl, model, providerType, save, t])

  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('project:settings.embedding.sectionTitle')}</div>
        <p className="text-[11px] text-text-dim mb-4">{t('project:settings.embedding.description')}</p>

        {/* Mode radio buttons */}
        <div className="flex flex-col gap-2 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="embedding-mode"
              checked={mode === 'default'}
              onChange={() => handleModeChange('default')}
              className="accent-accent-blue"
            />
            <span className="text-[12px] text-text-primary">{t('project:settings.embedding.useGlobal')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="embedding-mode"
              checked={mode === 'custom'}
              onChange={() => handleModeChange('custom')}
              className="accent-accent-blue"
            />
            <span className="text-[12px] text-text-primary">{t('project:settings.embedding.custom')}</span>
          </label>
        </div>

        {mode === 'default' ? (
          <div className="p-3 bg-deep border-2 border-border-dim">
            {globalConfigured ? (
              <p className="text-[11px] text-text-secondary">{globalSummary}</p>
            ) : (
              <p className="text-[11px] text-accent-amber">{t('project:settings.embedding.globalNotConfigured')}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Provider Type */}
            <div>
              <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('settings:embedding.provider.typeLabel')}</label>
              <select
                value={providerType}
                onChange={e => handleProviderTypeChange(e.target.value as EmbeddingProviderType)}
                className="w-full h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer"
              >
                <option value="openai">OpenAI</option>
                <option value="openai-compatible">{t('settings:embedding.provider.customType')}</option>
              </select>
            </div>

            {/* API Key */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <PixelInput label={t('settings:embedding.provider.apiKeyLabel')} type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} onBlur={handleApiKeyBlur} placeholder="sk-..." />
              </div>
              <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>{showKey ? t('settings:embedding.provider.hide') : t('settings:embedding.provider.show')}</PixelButton>
            </div>

            {/* Base URL */}
            <PixelInput
              label={isCustomProvider ? t('settings:embedding.provider.baseUrlRequired') : t('settings:embedding.provider.baseUrlOptional')}
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              onBlur={handleBaseUrlBlur}
              placeholder={isCustomProvider ? 'https://api.example.com/v1' : t('settings:embedding.provider.baseUrlPlaceholder')}
            />

            {/* Model */}
            <div>
              <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('settings:embedding.provider.modelLabel')}</label>
              {isCustomProvider || useCustomModel ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={model} onChange={e => setModel(e.target.value)} onBlur={handleCustomModelBlur} disabled={locked} placeholder="model-id" className="flex-1 h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none disabled:opacity-50" />
                  {!isCustomProvider && (
                    <button onClick={() => { setUseCustomModel(false); const p = OPENAI_EMBED_MODELS[0]; setModel(p); save({ model: p, testStatus: 'untested' }) }} className="text-[9px] text-accent-blue hover:text-text-primary cursor-pointer whitespace-nowrap">{t('settings:embedding.provider.presets')}</button>
                  )}
                </div>
              ) : (
                <select value={OPENAI_EMBED_MODELS.includes(model) ? model : '__custom__'} onChange={e => handleModelSelect(e.target.value)} disabled={locked} className="w-full h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer disabled:opacity-50">
                  {OPENAI_EMBED_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="__custom__">{t('settings:embedding.provider.modelOther')}</option>
                </select>
              )}
              {locked && (
                <p className="text-[10px] text-accent-amber mt-1">{t('project:settings.embedding.locked')}</p>
              )}
            </div>

            {/* Test */}
            <div className="flex items-center gap-2">
              <PixelButton size="sm" variant={testStatus === 'ok' ? 'ghost' : 'secondary'} onClick={runTest} disabled={testing}>
                {testing ? '...' : testStatus === 'ok' ? t('settings:embedding.test.retest') : t('settings:embedding.test.test')}
              </PixelButton>
              {testing ? (
                <span className="text-[9px] text-accent-blue animate-pulse">{t('settings:embedding.test.testing')}</span>
              ) : testStatus === 'ok' ? (
                <span className="text-[9px] text-accent-green">{testLatency > 0 ? t('settings:embedding.test.okLatency', { latency: testLatency }) : t('settings:embedding.test.ok')}</span>
              ) : testStatus === 'error' ? (
                <span className="text-[9px] text-accent-red">{t('settings:embedding.test.failed')}</span>
              ) : (
                <span className="text-[9px] text-text-dim">{t('settings:embedding.test.untested')}</span>
              )}
            </div>
            {!testing && testStatus === 'error' && testError && (
              <div className="p-1.5 bg-accent-red/10 border border-accent-red/30">
                <span className="text-[9px] text-accent-red font-mono break-all">{testError}</span>
              </div>
            )}
          </div>
        )}
      </PixelCard>
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
