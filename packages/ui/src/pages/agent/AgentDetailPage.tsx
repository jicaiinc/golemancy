import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Agent, AgentId, AgentStatus, SkillId, MemoryEntry, MemoryId } from '@golemancy/shared'
import { DEFAULT_COMPACT_THRESHOLD, DEFAULT_MEMORY_AUTO_LOAD, DEFAULT_MEMORY_PRIORITY, BUILTIN_TOOL_DEFAULTS } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { usePermissionConfig } from '../../hooks'
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
  const agent = agents.find(a => a.id === agentId)

  const validTabs = ['general', 'model-config', 'skills', 'tools', 'mcp', 'memory']
  const initialTab = (location.state as { tab?: string } | null)?.tab
  const [activeTab, setActiveTab] = useState(initialTab && validTabs.includes(initialTab) ? initialTab : 'general')

  const tabs = useMemo(() => [
    { id: 'general', label: t('detail.tabs.general') },
    { id: 'model-config', label: t('detail.tabs.modelConfig') },
    { id: 'skills', label: t('detail.tabs.skills') },
    { id: 'tools', label: t('detail.tabs.tools') },
    { id: 'mcp', label: 'MCP' },
    { id: 'memory', label: t('detail.tabs.memory') },
  ], [t])

  if (!agent) {
    return (
      <div className="p-6">
        <p className="text-text-dim">{t('detail.notFound')}</p>
        <PixelButton
          variant="ghost"
          className="mt-2"
          onClick={() => navigate(`/projects/${projectId}/agents`)}
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
          onClick={() => navigate(`/projects/${projectId}/agents`)}
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
            {agent.modelConfig.model && (
              <span className="font-mono text-accent-blue">{agent.modelConfig.model}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <PixelTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === 'general' && <GeneralAgentTab agent={agent} onUpdate={updateAgent} onDelete={async () => { await deleteAgent(agent.id); navigate(`/projects/${projectId}/agents`) }} />}
        {activeTab === 'model-config' && <ModelConfigTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'skills' && <SkillsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'tools' && <ToolsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'mcp' && <MCPTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'memory' && <MemoryTab agent={agent} />}
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-accent-red">{t('general.deleteConfirm')}</span>
              <PixelButton variant="danger" size="sm" onClick={onDelete}>{t('common:button.confirm')}</PixelButton>
              <PixelButton variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>{t('common:button.cancel')}</PixelButton>
            </div>
          ) : (
            <PixelButton variant="danger" onClick={() => setShowDeleteConfirm(true)}>{t('general.deleteBtn')}</PixelButton>
          )}
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
  const builtinToolDefs = [
    { id: 'bash', name: 'Bash', description: t('tools.bashDesc'), available: true },
    { id: 'browser', name: 'Browser', description: t('tools.browserDesc'), available: true },
    { id: 'computer_use', name: 'Computer Use', description: t('tools.computerUseDesc'), available: false },
    { id: 'task', name: 'Task', description: t('tools.taskDesc'), available: true },
    { id: 'memory', name: 'Memory', description: t('tools.memoryDesc'), available: true },
  ] as const

  async function toggleBuiltinTool(toolId: string) {
    const current = agent.builtinTools[toolId] ?? (BUILTIN_TOOL_DEFAULTS[toolId as keyof typeof BUILTIN_TOOL_DEFAULTS] ?? false)
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
            const enabled = agent.builtinTools[tool.id] ?? (BUILTIN_TOOL_DEFAULTS[tool.id as keyof typeof BUILTIN_TOOL_DEFAULTS] ?? false)
            return (
              <PixelCard key={tool.id} className={`flex items-center gap-3 ${!tool.available ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-accent-amber">{tool.name}</span>
                    {!tool.available && (
                      <span className="text-[9px] text-text-dim font-pixel">{t('tools.comingSoon')}</span>
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

// ========== Priority Stars (hover-fill UX) ==========
function PriorityStars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const displayValue = hoverValue ?? value

  return (
    <span className="inline-flex gap-0.5" onMouseLeave={() => setHoverValue(null)}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          className={`text-[10px] leading-none ${i <= displayValue ? 'text-accent-amber' : 'text-border-dim'} ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={() => onChange?.(i === value ? i - 1 : i)}
          onMouseEnter={() => onChange && setHoverValue(i)}
          disabled={!onChange}
        >
          ★
        </button>
      ))}
    </span>
  )
}

// ========== Memory Tab ==========
function MemoryTab({ agent }: { agent: Agent }) {
  const { t } = useTranslation('agent')
  const memories = useAppStore(s => s.memories)
  const memoriesLoading = useAppStore(s => s.memoriesLoading)
  const loadMemories = useAppStore(s => s.loadMemories)
  const createMemory = useAppStore(s => s.createMemory)
  const updateMemory = useAppStore(s => s.updateMemory)
  const deleteMemory = useAppStore(s => s.deleteMemory)

  const [showAdd, setShowAdd] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newPriority, setNewPriority] = useState(DEFAULT_MEMORY_PRIORITY)
  const [newPinned, setNewPinned] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<MemoryId | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editPriority, setEditPriority] = useState(DEFAULT_MEMORY_PRIORITY)
  const [confirmDeleteId, setConfirmDeleteId] = useState<MemoryId | null>(null)

  const memoryConfig = agent.builtinTools?.memory
  const maxAutoLoad = typeof memoryConfig === 'object' && memoryConfig
    ? ((memoryConfig as Record<string, unknown>).maxAutoLoad as number | undefined) ?? DEFAULT_MEMORY_AUTO_LOAD
    : DEFAULT_MEMORY_AUTO_LOAD

  useEffect(() => {
    loadMemories(agent.id)
  }, [agent.id])

  const pinned = useMemo(() =>
    memories
      .filter(m => m.pinned)
      .sort((a, b) => b.priority - a.priority || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [memories],
  )

  const nonPinned = useMemo(() =>
    memories
      .filter(m => !m.pinned)
      .sort((a, b) => b.priority - a.priority || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [memories],
  )

  const autoLoaded = nonPinned.slice(0, maxAutoLoad)
  const notLoaded = nonPinned.slice(maxAutoLoad)

  async function handleAdd() {
    setAdding(true)
    try {
      const tags = newTags.split(',').map(s => s.trim()).filter(Boolean)
      await createMemory(agent.id, {
        content: newContent.trim(),
        priority: newPriority,
        pinned: newPinned,
        tags,
      })
      setNewContent('')
      setNewTags('')
      setNewPriority(DEFAULT_MEMORY_PRIORITY)
      setNewPinned(false)
      setShowAdd(false)
    } finally {
      setAdding(false)
    }
  }

  function startEdit(mem: MemoryEntry) {
    setEditingId(mem.id)
    setEditContent(mem.content)
    setEditTags(mem.tags.join(', '))
    setEditPriority(mem.priority)
  }

  async function handleEditSave(mem: MemoryEntry) {
    const tags = editTags.split(',').map(s => s.trim()).filter(Boolean)
    await updateMemory(agent.id, mem.id, { content: editContent.trim(), tags, priority: editPriority })
    setEditingId(null)
  }

  function relativeTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('common:time.justNow')
    if (mins < 60) return t('common:time.minsAgo', { count: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('common:time.hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    return t('common:time.daysAgo', { count: days })
  }

  function renderCard(m: MemoryEntry, dimmed = false) {
    const isEditing = editingId === m.id
    return (
      <PixelCard key={m.id} className={`!py-2 !px-3 ${dimmed ? 'opacity-85' : ''}`}>
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <PixelTextArea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} />
            <PixelInput value={editTags} onChange={e => setEditTags(e.target.value)} placeholder={t('memory.tagsPlaceholder')} />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-dim">{t('memory.priority')}:</span>
              <PriorityStars value={editPriority} onChange={setEditPriority} />
            </div>
            <div className="flex gap-2">
              <PixelButton size="sm" variant="primary" onClick={() => handleEditSave(m)}>{t('common:button.save')}</PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => setEditingId(null)}>{t('common:button.cancel')}</PixelButton>
            </div>
          </div>
        ) : (
          <>
            <div className="text-[12px] text-text-secondary whitespace-pre-wrap line-clamp-1" title={m.content}>
              {m.content}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-text-dim">
              <PriorityStars value={m.priority} />
              {m.tags.length > 0 && (
                <span className="font-mono text-[9px] text-accent-cyan truncate">
                  {m.tags.map(tag => `#${tag}`).join(' ')}
                </span>
              )}
              <span className="shrink-0">{relativeTime(m.updatedAt)}</span>
              <div className="ml-auto flex items-center gap-0.5 shrink-0">
                {confirmDeleteId === m.id ? (
                  <>
                    <PixelButton size="sm" variant="danger" onClick={() => { setConfirmDeleteId(null); deleteMemory(agent.id, m.id) }}>
                      {t('common:button.confirm')}
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                      {t('common:button.cancel')}
                    </PixelButton>
                  </>
                ) : (
                  <>
                    <PixelButton size="sm" variant="ghost" onClick={() => updateMemory(agent.id, m.id, { pinned: !m.pinned })}>
                      {m.pinned ? t('memory.unpin') : t('memory.pin')}
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => startEdit(m)}>
                      {t('common:button.edit')}
                    </PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDeleteId(m.id)}>
                      &times;
                    </PixelButton>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </PixelCard>
    )
  }

  if (memoriesLoading) {
    return <div className="text-text-dim text-[12px]">{t('common:status.loading')}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="font-pixel text-[8px] text-text-dim">{t('memory.sectionTitle')}</div>
        <PixelButton size="sm" variant="ghost" onClick={() => setShowAdd(!showAdd)}>
          {t('memory.addBtn')}
        </PixelButton>
      </div>

      {memories.length > 0 && (
        <div className="text-[10px] text-text-dim mb-4">
          {t('memory.statusLine', {
            pinned: pinned.length,
            autoLoaded: autoLoaded.length,
            limit: maxAutoLoad,
            total: memories.length,
          })}
        </div>
      )}

      {showAdd && (
        <PixelCard className="mb-4">
          <div className="font-pixel text-[8px] text-text-dim mb-2">{t('memory.addTitle')}</div>
          <div className="flex flex-col gap-2">
            <PixelTextArea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder={t('memory.contentPlaceholder')}
              rows={3}
            />
            <PixelInput
              value={newTags}
              onChange={e => setNewTags(e.target.value)}
              placeholder={t('memory.tagsPlaceholder')}
            />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-dim">{t('memory.priority')}:</span>
                <PriorityStars value={newPriority} onChange={setNewPriority} />
              </div>
              <label className="flex items-center gap-1 text-[10px] text-text-dim cursor-pointer">
                <input type="checkbox" checked={newPinned} onChange={e => setNewPinned(e.target.checked)} />
                {t('memory.pinned')}
              </label>
            </div>
            <div className="flex gap-2">
              <PixelButton size="sm" variant="primary" onClick={handleAdd} disabled={adding || !newContent.trim()}>
                {adding ? t('common:button.saving') : t('common:button.save')}
              </PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                {t('common:button.cancel')}
              </PixelButton>
            </div>
          </div>
        </PixelCard>
      )}

      {memories.length === 0 && !showAdd && (
        <PixelCard variant="outlined" className="text-center py-8">
          <p className="text-[12px] text-text-dim">{t('memory.empty')}</p>
        </PixelCard>
      )}

      {pinned.length > 0 && (
        <div className="mb-4">
          <div className="font-pixel text-[8px] text-text-dim mb-2">
            {t('memory.pinnedSection')} — {t('memory.pinnedHint')}
          </div>
          <div className="flex flex-col gap-2">
            {pinned.map(m => renderCard(m))}
          </div>
        </div>
      )}

      {autoLoaded.length > 0 && (
        <div className="mb-4">
          <div className="font-pixel text-[8px] text-text-dim mb-2">
            {t('memory.autoLoadedSection')} ({autoLoaded.length}/{maxAutoLoad})
          </div>
          <div className="flex flex-col gap-2">
            {autoLoaded.map(m => renderCard(m))}
          </div>
        </div>
      )}

      {notLoaded.length > 0 && (
        <div className="border-t border-dashed border-border-dim my-4 relative">
          <span className="absolute left-1/2 -translate-x-1/2 -top-2 bg-deep px-2 text-[9px] text-text-dim">
            {t('memory.cutoffLine')}
          </span>
        </div>
      )}

      {notLoaded.length > 0 && (
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-2">
            {t('memory.notLoadedSection')} ({t('memory.notLoadedCount', { count: notLoaded.length })})
          </div>
          <div className="flex flex-col gap-2">
            {notLoaded.map(m => renderCard(m, true))}
          </div>
        </div>
      )}
    </div>
  )
}
