import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Agent, AgentId, AgentStatus, SkillId } from '@golemancy/shared'
import { DEFAULT_COMPACT_THRESHOLD } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { usePermissionConfig } from '../../hooks'
import { resolveEmbeddingConfig } from '../../lib/embedding'
import {
  PixelButton, PixelCard, PixelBadge, PixelAvatar, PixelTabs,
  PixelInput, PixelTextArea, CompactThresholdControl,
} from '../../components'

// --- Status helpers ---
const statusBadgeVariant: Record<AgentStatus, 'idle' | 'running' | 'error' | 'paused'> = {
  idle: 'idle', running: 'running', error: 'error', paused: 'paused',
}
const statusBarColor: Record<AgentStatus, string> = {
  idle: 'bg-text-secondary', running: 'bg-accent-green', error: 'bg-accent-red', paused: 'bg-accent-amber',
}
const statusAnimation: Record<AgentStatus, string> = {
  idle: '', running: 'animate-[pixel-pulse_1s_steps(2)_infinite]', error: 'animate-[pixel-shake_0.3s_steps(3)_infinite]', paused: 'animate-[pixel-blink_2s_steps(2)_infinite]',
}

export function AgentDetailPage() {
  const { t } = useTranslation('agent')
  const { projectId, agentId } = useParams<{ projectId: string; agentId: string }>()
  const agents = useAppStore(s => s.agents)
  const updateAgent = useAppStore(s => s.updateAgent)
  const deleteAgent = useAppStore(s => s.deleteAgent)
  const navigate = useNavigate()
  const location = useLocation()

  // Preserve the view mode we came from
  const fromView = (location.state as { fromView?: 'grid' | 'topology' })?.fromView

  const agent = agents.find(a => a.id === agentId)
  const [activeTab, setActiveTab] = useState('general')

  const tabs = useMemo(() => [
    { id: 'general', label: t('detail.tabs.general') },
    { id: 'model-config', label: t('detail.tabs.modelConfig') },
    { id: 'skills', label: t('detail.tabs.skills') },
    { id: 'tools', label: t('detail.tabs.tools') },
    { id: 'mcp', label: 'MCP' },
    { id: 'sub-agents', label: t('detail.tabs.subAgents') },
  ], [t])

  if (!agent) {
    return (
      <div className="p-6">
        <p className="text-text-dim">{t('detail.notFound')}</p>
        <PixelButton
          variant="ghost"
          className="mt-2"
          onClick={() => navigate(`/projects/${projectId}/agents`, fromView ? { state: { fromView } } : undefined)}
        >
          {t('detail.backToAgents')}
        </PixelButton>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <PixelButton
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}/agents`, fromView ? { state: { fromView } } : undefined)}
        >
          {t('detail.backBtn')}
        </PixelButton>
      </div>

      <div className="flex items-start gap-4 mb-6">
        <div className="relative">
          <div className={`absolute -top-1 -left-1 -right-1 h-1 ${statusBarColor[agent.status]} ${statusAnimation[agent.status]}`} />
          <PixelAvatar
            size="xl"
            initials={agent.name}
            status={agent.status === 'running' ? 'online' : agent.status === 'error' ? 'error' : agent.status === 'paused' ? 'paused' : 'offline'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-pixel text-[14px] text-text-primary">{agent.name}</h1>
            <PixelBadge variant={statusBadgeVariant[agent.status]}>{t(`statusLabel.${agent.status}`)}</PixelBadge>
          </div>
          <p className="text-[13px] text-text-secondary mt-1">{agent.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-text-dim">
            <span>{t('count.skills', { count: (agent.skillIds ?? []).length })}</span>
            <span>{t('count.tools', { count: agent.tools.length })}</span>
            <span>{t('count.mcpServers', { count: (agent.mcpServers ?? []).length })}</span>
            <span>{t('count.subAgents', { count: agent.subAgents.length })}</span>
            {agent.modelConfig.model && (
              <span className="font-mono text-accent-blue">{agent.modelConfig.model}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <PixelTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === 'general' && <GeneralAgentTab agent={agent} onUpdate={updateAgent} onDelete={async () => { await deleteAgent(agent.id); navigate(`/projects/${projectId}/agents`, fromView ? { state: { fromView } } : undefined) }} />}
        {activeTab === 'model-config' && <ModelConfigTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'skills' && <SkillsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'tools' && <ToolsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'mcp' && <MCPTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'sub-agents' && <SubAgentsTab agent={agent} onUpdate={updateAgent} />}
      </div>
    </div>
  )
}

// ========== General Tab (Info only) ==========
function GeneralAgentTab({ agent, onUpdate, onDelete }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const { t } = useTranslation('agent')
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(agent.name)
    setDescription(agent.description)
    setSystemPrompt(agent.systemPrompt)
  }, [agent.id])

  async function handleSave() {
    setSaving(true)
    await onUpdate(agent.id, {
      name: name.trim(),
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-[640px] flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">{t('general.sectionTitle')}</div>
        <div className="flex flex-col gap-4">
          <PixelInput label={t('label.name')} value={name} onChange={e => setName(e.target.value)} />
          <PixelInput label={t('label.description')} value={description} onChange={e => setDescription(e.target.value)} />
          <PixelTextArea label={t('label.systemPrompt')} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={8} />
        </div>
      </PixelCard>

      <div className="flex items-center gap-3">
        <PixelButton variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? t('common:button.saving') : t('common:button.save')}
        </PixelButton>
        {saved && <span className="text-[12px] text-accent-green">{t('savedMsg')}</span>}
        <div className="ml-auto">
          <PixelButton variant="danger" onClick={onDelete}>{t('general.deleteBtn')}</PixelButton>
        </div>
      </div>
    </div>
  )
}

// ========== Model Config Tab ==========
function ModelConfigTab({ agent, onUpdate }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
}) {
  const { t } = useTranslation('agent')
  const settings = useAppStore(s => s.settings)
  const [providerSlug, setProviderSlug] = useState(agent.modelConfig.provider)
  const [model, setModel] = useState(agent.modelConfig.model)
  const [compactThreshold, setCompactThreshold] = useState(
    agent.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD,
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Filter to available providers: test must have passed
  const availableProviders = Object.entries(settings?.providers ?? {}).filter(
    ([, entry]) => entry.testStatus === 'ok',
  )

  useEffect(() => {
    setProviderSlug(agent.modelConfig.provider)
    setModel(agent.modelConfig.model)
    setCompactThreshold(agent.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD)
  }, [agent.id])

  // Auto-fallback: if the agent's provider doesn't exist in available providers, switch to first available
  useEffect(() => {
    if (availableProviders.length > 0 && !settings?.providers[providerSlug]) {
      const [slug, entry] = availableProviders[0]
      setProviderSlug(slug)
      setModel(entry.models[0] ?? '')
    }
  }, [availableProviders.length, providerSlug, settings?.providers])

  const selectedProvider = settings?.providers[providerSlug]
  const models = selectedProvider?.models ?? []

  function handleProviderChange(slug: string) {
    setProviderSlug(slug)
    const entry = settings?.providers[slug]
    setModel(entry?.models[0] ?? '')
  }

  async function handleSave() {
    setSaving(true)
    await onUpdate(agent.id, {
      modelConfig: { provider: providerSlug, model },
      compactThreshold,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-[640px] flex flex-col gap-4">
      {/* Model Config section */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">{t('modelConfig.sectionTitle')}</div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('label.provider')}</label>
            <select
              value={providerSlug}
              onChange={e => handleProviderChange(e.target.value)}
              className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
            >
              {availableProviders.length === 0 && <option value="">{t('noProviders')}</option>}
              {availableProviders.map(([slug, entry]) => (
                <option key={slug} value={slug}>{entry.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('label.model')}</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
            >
              {models.length === 0 && <option value="">{t('noModels')}</option>}
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </PixelCard>

      {/* Compact Threshold */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('modelConfig.compactLabel')}</div>
        <CompactThresholdControl value={compactThreshold} onChange={setCompactThreshold} />
      </PixelCard>

      <div className="flex items-center gap-3">
        <PixelButton variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? t('common:button.saving') : t('common:button.save')}
        </PixelButton>
        {saved && <span className="text-[12px] text-accent-green">{t('savedMsg')}</span>}
      </div>
    </div>
  )
}

// ========== Skills Tab ==========
function SkillsTab({ agent, onUpdate }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
}) {
  const { t } = useTranslation('agent')
  const skills = useAppStore(s => s.skills)
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const assigned = skills.filter(s => agent.skillIds.includes(s.id))
  const available = skills.filter(s => !agent.skillIds.includes(s.id))

  async function addSkill(skillId: SkillId) {
    await onUpdate(agent.id, { skillIds: [...agent.skillIds, skillId] })
  }

  async function removeSkill(skillId: SkillId) {
    await onUpdate(agent.id, { skillIds: agent.skillIds.filter(id => id !== skillId) })
  }

  return (
    <div className="max-w-[640px]">
      {/* Assigned skills */}
      <div className="font-pixel text-[8px] text-text-dim mb-2">{t('skills.assigned')}</div>
      {assigned.length > 0 ? (
        <div className="flex flex-col gap-2">
          {assigned.map(skill => (
            <PixelCard key={skill.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-pixel text-[9px] text-accent-cyan">{skill.name}</div>
                <div className="text-[11px] text-text-secondary mt-0.5">{skill.description}</div>
              </div>
              <PixelButton size="sm" variant="ghost" onClick={() => removeSkill(skill.id)}>
                &times;
              </PixelButton>
            </PixelCard>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-text-dim mb-2">{t('skills.noneAssigned')}</p>
      )}

      {/* Divider */}
      <div className="border-t border-border-dim my-4" />

      {/* Available skills picker */}
      {available.length > 0 && (
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-2">{t('skills.addSection')}</div>
          <div className="flex flex-col gap-1">
            {available.map(skill => (
              <button
                key={skill.id}
                className="flex items-center gap-3 p-2 text-left hover:bg-elevated/50 cursor-pointer transition-colors"
                onClick={() => addSkill(skill.id)}
              >
                <span className="font-pixel text-[9px] text-accent-cyan">{skill.name}</span>
                <span className="text-[11px] text-text-dim">{skill.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {skills.length === 0 && (
        <PixelCard variant="outlined" className="text-center py-8">
          <p className="text-[12px] text-text-dim mb-2">{t('skills.noneInProject')}</p>
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/skills`)}>
            {t('skills.goTo')}
          </PixelButton>
        </PixelCard>
      )}

      {/* Manage link */}
      {skills.length > 0 && (
        <div className="mt-4">
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/skills`)}>
            {t('skills.manage')}
          </PixelButton>
        </div>
      )}
    </div>
  )
}

// ========== Tools Tab ==========
function ToolsTab({ agent, onUpdate }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
}) {
  const { t } = useTranslation('agent')
  const settings = useAppStore(s => s.settings)
  const projects = useAppStore(s => s.projects)
  const currentProjectId = useAppStore(s => s.currentProjectId)
  const currentProject = projects.find(p => p.id === currentProjectId)
  const embeddingConfigured = !!resolveEmbeddingConfig(settings, currentProject?.config)
  const builtinToolDefs = [
    { id: 'bash', name: 'Bash', description: t('tools.bashDesc'), defaultEnabled: true, available: true },
    { id: 'browser', name: 'Browser', description: t('tools.browserDesc'), defaultEnabled: false, available: true },
    { id: 'os_control', name: 'OS Control', description: t('tools.osControlDesc'), defaultEnabled: false, available: false, unavailableLabel: t('tools.comingSoon') },
    { id: 'task', name: 'Task', description: t('tools.taskDesc'), defaultEnabled: true, available: true },
    { id: 'knowledge_base', name: 'Knowledge Base', description: t('tools.knowledgeBaseDesc'), defaultEnabled: true, available: embeddingConfigured, unavailableLabel: t('tools.embeddingNotConfigured') },
  ]

  async function toggleBuiltinTool(toolId: string) {
    const def = builtinToolDefs.find(d => d.id === toolId)
    const current = agent.builtinTools[toolId] ?? (def?.defaultEnabled ?? false)
    await onUpdate(agent.id, {
      builtinTools: { ...agent.builtinTools, [toolId]: !current },
    })
  }

  return (
    <div className="max-w-[640px]">
      {/* Built-in Tools Section */}
      <div className="mb-6">
        <div className="font-pixel text-[8px] text-text-dim mb-2">{t('tools.builtinSection')}</div>
        <div className="flex flex-col gap-2">
          {builtinToolDefs.map(tool => {
            const enabled = agent.builtinTools[tool.id] ?? (tool.defaultEnabled ?? false)
            const showWarning = enabled && !tool.available && tool.id === 'knowledge_base'
            return (
              <PixelCard key={tool.id} className={`flex flex-col gap-1 ${!tool.available ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-accent-amber">{tool.name}</span>
                      {!tool.available && (
                        <span className="text-[9px] text-text-dim font-pixel">{tool.unavailableLabel ?? t('tools.comingSoon')}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-secondary mt-0.5">{tool.description}</div>
                  </div>
                  <button
                    className={`w-10 h-5 border-2 transition-colors cursor-pointer ${
                      enabled && tool.available
                        ? 'bg-accent-green border-accent-green'
                        : 'bg-deep border-border-dim'
                    } ${!tool.available ? 'cursor-not-allowed' : ''}`}
                    onClick={() => tool.available && toggleBuiltinTool(tool.id)}
                    disabled={!tool.available}
                  >
                    <div className={`w-3 h-3 bg-white transition-transform ${
                      enabled && tool.available ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                {showWarning && (
                  <p className="text-[10px] text-accent-amber">{t('tools.kbUnavailableHint')}</p>
                )}
              </PixelCard>
            )
          })}
        </div>
      </div>

      {/* Custom Tools Section */}
      {agent.tools.length > 0 && (
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-2">{t('tools.customSection')}</div>
          <div className="flex flex-col gap-2">
            {agent.tools.map(tool => (
              <PixelCard key={tool.id} className="flex items-start gap-3">
                <span className="font-mono text-[12px] text-accent-amber shrink-0">{tool.name}</span>
                <span className="text-[12px] text-text-secondary flex-1">{tool.description}</span>
              </PixelCard>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ========== MCP Tab ==========
function MCPTab({ agent, onUpdate }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
}) {
  const { t } = useTranslation('agent')
  const mcpServers = useAppStore(s => s.mcpServers)
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const { mode, applyToMCP, sandboxSupported } = usePermissionConfig()

  const assignedNames = agent.mcpServers ?? []
  const assigned = mcpServers.filter(s => assignedNames.includes(s.name))
  const available = mcpServers.filter(s => !assignedNames.includes(s.name))

  // Determine warning type
  const isRestricted = mode === 'restricted'
  const showRiskWarning = mode === 'unrestricted' || (mode === 'sandbox' && (!applyToMCP || !sandboxSupported))
  const hasStdioServers = assigned.some(s => s.transportType === 'stdio')

  async function addServer(name: string) {
    await onUpdate(agent.id, { mcpServers: [...assignedNames, name] })
  }

  async function removeServer(name: string) {
    await onUpdate(agent.id, { mcpServers: assignedNames.filter(n => n !== name) })
  }

  const transportColors: Record<string, string> = {
    stdio: 'text-accent-green',
    sse: 'text-accent-amber',
    http: 'text-accent-blue',
  }

  return (
    <div className="max-w-[640px]">
      {/* MCP security warnings */}
      {showRiskWarning && (
        <PixelCard variant="outlined" className="mb-4 border-accent-amber bg-accent-amber/5">
          <div className="flex items-start gap-2">
            <span className="font-pixel text-[10px] text-accent-amber shrink-0 mt-0.5">{t('mcp.warningTitle')}</span>
            <div className="text-[12px] text-text-secondary">
              <p>{t('mcp.warningText')}</p>
              {mode === 'sandbox' && sandboxSupported && !applyToMCP && (
                <p className="mt-1 text-text-dim">
                  {t('mcp.enableSandboxHint')}
                </p>
              )}
              {mode === 'sandbox' && !sandboxSupported && (
                <p className="mt-1 text-text-dim">{t('mcp.sandboxUnavailable')}</p>
              )}
            </div>
          </div>
        </PixelCard>
      )}

      {/* Assigned servers */}
      <div className="font-pixel text-[8px] text-text-dim mb-2">{t('mcp.assigned')}</div>
      {assigned.length > 0 ? (
        <div className="flex flex-col gap-2">
          {assigned.map(server => (
            <PixelCard key={server.name} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-pixel text-[9px] text-accent-purple">{server.name}</span>
                  <span className={`font-mono text-[9px] ${transportColors[server.transportType] ?? 'text-text-dim'}`}>
                    {server.transportType.toUpperCase()}
                  </span>
                  {isRestricted && server.transportType === 'stdio' && (
                    <PixelBadge variant="error">{t('mcp.restricted')}</PixelBadge>
                  )}
                </div>
                {server.description && (
                  <div className="text-[11px] text-text-secondary mt-0.5">{server.description}</div>
                )}
              </div>
              <PixelButton size="sm" variant="ghost" onClick={() => removeServer(server.name)}>
                &times;
              </PixelButton>
            </PixelCard>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-text-dim mb-2">{t('mcp.noneAssigned')}</p>
      )}

      {/* Divider */}
      <div className="border-t border-border-dim my-4" />

      {/* Available servers picker */}
      {available.length > 0 && (
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-2">{t('mcp.addSection')}</div>
          <div className="flex flex-col gap-1">
            {available.map(server => (
              <button
                key={server.name}
                className="flex items-center gap-3 p-2 text-left hover:bg-elevated/50 cursor-pointer transition-colors"
                onClick={() => addServer(server.name)}
              >
                <span className="font-pixel text-[9px] text-accent-purple">{server.name}</span>
                <span className={`font-mono text-[9px] ${transportColors[server.transportType] ?? 'text-text-dim'}`}>
                  {server.transportType.toUpperCase()}
                </span>
                {server.description && (
                  <span className="text-[11px] text-text-dim">{server.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {mcpServers.length === 0 && (
        <PixelCard variant="outlined" className="text-center py-8">
          <p className="text-[12px] text-text-dim mb-2">{t('mcp.noneInProject')}</p>
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/mcp-servers`)}>
            {t('mcp.goTo')}
          </PixelButton>
        </PixelCard>
      )}

      {/* Manage link */}
      {mcpServers.length > 0 && (
        <div className="mt-4">
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/mcp-servers`)}>
            {t('mcp.manage')}
          </PixelButton>
        </div>
      )}
    </div>
  )
}

// ========== Sub-Agents Tab ==========
function SubAgentsTab({ agent, onUpdate }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
}) {
  const { t } = useTranslation('agent')
  const agents = useAppStore(s => s.agents)
  const available = agents.filter(a => a.id !== agent.id && !agent.subAgents.some(s => s.agentId === a.id))

  async function addSubAgent(targetId: AgentId) {
    await onUpdate(agent.id, {
      subAgents: [...agent.subAgents, { agentId: targetId, role: 'assistant' }],
    })
  }

  async function removeSubAgent(targetId: AgentId) {
    await onUpdate(agent.id, {
      subAgents: agent.subAgents.filter(s => s.agentId !== targetId),
    })
  }

  async function updateRole(targetId: AgentId, role: string) {
    await onUpdate(agent.id, {
      subAgents: agent.subAgents.map(s => s.agentId === targetId ? { ...s, role } : s),
    })
  }

  return (
    <div className="max-w-[640px]">
      {/* Assigned sub-agents */}
      <div className="font-pixel text-[8px] text-text-dim mb-2">{t('subAgents.assigned')}</div>
      {agent.subAgents.length > 0 ? (
        <div className="flex flex-col gap-2">
          {agent.subAgents.map(sub => {
            const subAgent = agents.find(a => a.id === sub.agentId)
            return (
              <PixelCard key={sub.agentId} className="flex items-center gap-3">
                <PixelAvatar size="sm" initials={subAgent?.name ?? '??'} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-text-primary">{subAgent?.name ?? t('subAgents.unknown')}</div>
                  <input
                    className="bg-transparent text-[11px] text-accent-purple outline-none border-b border-transparent focus:border-accent-purple w-full"
                    value={sub.role}
                    onChange={e => updateRole(sub.agentId, e.target.value)}
                    placeholder={t('subAgents.rolePlaceholder')}
                  />
                </div>
                <PixelButton size="sm" variant="ghost" onClick={() => removeSubAgent(sub.agentId)}>
                  &times;
                </PixelButton>
              </PixelCard>
            )
          })}
        </div>
      ) : (
        <p className="text-[12px] text-text-dim mb-2">{t('subAgents.noneAssigned')}</p>
      )}

      {/* Divider */}
      <div className="border-t border-border-dim my-4" />

      {/* Add sub-agent picker */}
      {available.length > 0 ? (
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-2">{t('subAgents.addSection')}</div>
          <div className="flex flex-col gap-1">
            {available.map(a => (
              <button
                key={a.id}
                className="flex items-center gap-3 p-2 text-left hover:bg-elevated/50 cursor-pointer transition-colors"
                onClick={() => addSubAgent(a.id)}
              >
                <PixelAvatar size="xs" initials={a.name} />
                <span className="text-[12px] text-text-secondary">{a.name}</span>
                <span className="text-[11px] text-text-dim">{a.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-text-dim">{t('subAgents.noneAvailable')}</p>
      )}
    </div>
  )
}
