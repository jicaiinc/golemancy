import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router'
import type { Agent, AgentId, AgentStatus, SkillId } from '@golemancy/shared'
import { DEFAULT_COMPACT_THRESHOLD } from '@golemancy/shared'
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

// --- Tab definitions ---
const TABS = [
  { id: 'general', label: 'General' },
  { id: 'skills', label: 'Skills' },
  { id: 'tools', label: 'Tools' },
  { id: 'mcp', label: 'MCP' },
  { id: 'sub-agents', label: 'Sub-Agents' },
]

export function AgentDetailPage() {
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

  if (!agent) {
    return (
      <div className="p-6">
        <p className="text-text-dim">Agent not found.</p>
        <PixelButton
          variant="ghost"
          className="mt-2"
          onClick={() => navigate(`/projects/${projectId}/agents`, fromView ? { state: { fromView } } : undefined)}
        >
          &lt; Back to Agents
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
          &lt; Agents
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
            <PixelBadge variant={statusBadgeVariant[agent.status]}>{agent.status}</PixelBadge>
          </div>
          <p className="text-[13px] text-text-secondary mt-1">{agent.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-text-dim">
            <span>{(agent.skillIds ?? []).length} skills</span>
            <span>{agent.tools.length} tools</span>
            <span>{(agent.mcpServers ?? []).length} MCP servers</span>
            <span>{agent.subAgents.length} sub-agents</span>
            {agent.modelConfig.model && (
              <span className="font-mono text-accent-blue">{agent.modelConfig.model}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <PixelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === 'general' && <GeneralAgentTab agent={agent} onUpdate={updateAgent} onDelete={async () => { await deleteAgent(agent.id); navigate(`/projects/${projectId}/agents`, fromView ? { state: { fromView } } : undefined) }} />}
        {activeTab === 'skills' && <SkillsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'tools' && <ToolsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'mcp' && <MCPTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'sub-agents' && <SubAgentsTab agent={agent} onUpdate={updateAgent} />}
      </div>
    </div>
  )
}

// ========== General Tab (Info + Model Config) ==========
function GeneralAgentTab({ agent, onUpdate, onDelete }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const settings = useAppStore(s => s.settings)
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt)
  const [providerSlug, setProviderSlug] = useState(agent.modelConfig.provider)
  const [model, setModel] = useState(agent.modelConfig.model)
  const [compactThreshold, setCompactThreshold] = useState(
    agent.compactThreshold ?? settings?.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD,
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Filter to available providers: test must have passed
  const availableProviders = Object.entries(settings?.providers ?? {}).filter(
    ([, entry]) => entry.testStatus === 'ok',
  )

  useEffect(() => {
    setName(agent.name)
    setDescription(agent.description)
    setSystemPrompt(agent.systemPrompt)
    setProviderSlug(agent.modelConfig.provider)
    setModel(agent.modelConfig.model)
    setCompactThreshold(agent.compactThreshold ?? settings?.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD)
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
      name: name.trim(),
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
      modelConfig: { provider: providerSlug, model },
      compactThreshold,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-[640px] flex flex-col gap-4">
      {/* Info section */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">INFO</div>
        <div className="flex flex-col gap-4">
          <PixelInput label="NAME" value={name} onChange={e => setName(e.target.value)} />
          <PixelInput label="DESCRIPTION" value={description} onChange={e => setDescription(e.target.value)} />
          <PixelTextArea label="SYSTEM PROMPT" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={8} />
        </div>
      </PixelCard>

      {/* Model Config section */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">MODEL CONFIG</div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">PROVIDER</label>
            <select
              value={providerSlug}
              onChange={e => handleProviderChange(e.target.value)}
              className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
            >
              {availableProviders.length === 0 && <option value="">No providers configured</option>}
              {availableProviders.map(([slug, entry]) => (
                <option key={slug} value={slug}>{entry.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">MODEL</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
            >
              {models.length === 0 && <option value="">No models available</option>}
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </PixelCard>

      {/* Compact Threshold */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">COMPACT THRESHOLD</div>
        <CompactThresholdControl value={compactThreshold} onChange={setCompactThreshold} />
      </PixelCard>

      <div className="flex items-center gap-3">
        <PixelButton variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </PixelButton>
        {saved && <span className="text-[12px] text-accent-green">Saved!</span>}
        <div className="ml-auto">
          <PixelButton variant="danger" onClick={onDelete}>Delete Agent</PixelButton>
        </div>
      </div>
    </div>
  )
}

// ========== Skills Tab ==========
function SkillsTab({ agent, onUpdate }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
}) {
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
      <div className="font-pixel text-[8px] text-text-dim mb-2">ASSIGNED SKILLS</div>
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
        <p className="text-[12px] text-text-dim mb-2">No skills assigned to this agent.</p>
      )}

      {/* Divider */}
      <div className="border-t border-border-dim my-4" />

      {/* Available skills picker */}
      {available.length > 0 && (
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-2">ADD SKILL</div>
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
          <p className="text-[12px] text-text-dim mb-2">No skills in this project</p>
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/skills`)}>
            Go to Skills
          </PixelButton>
        </PixelCard>
      )}

      {/* Manage link */}
      {skills.length > 0 && (
        <div className="mt-4">
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/skills`)}>
            Manage Skills &rarr;
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
  const builtinToolDefs = [
    { id: 'bash', name: 'Bash', description: 'Execute bash commands, read and write files', defaultEnabled: true, available: true },
    { id: 'browser', name: 'Browser', description: 'Control web browser for automation', defaultEnabled: false, available: true },
    { id: 'os_control', name: 'OS Control', description: 'Desktop automation and system control', defaultEnabled: false, available: false },
    { id: 'task', name: 'Task', description: 'Create and manage tasks within the conversation', defaultEnabled: true, available: true },
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
        <div className="font-pixel text-[8px] text-text-dim mb-2">BUILT-IN TOOLS</div>
        <div className="flex flex-col gap-2">
          {builtinToolDefs.map(tool => {
            const enabled = agent.builtinTools[tool.id] ?? (tool.defaultEnabled ?? false)
            return (
              <PixelCard key={tool.id} className={`flex items-center gap-3 ${!tool.available ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-accent-amber">{tool.name}</span>
                    {!tool.available && (
                      <span className="text-[9px] text-text-dim font-pixel">COMING SOON</span>
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
          <div className="font-pixel text-[8px] text-text-dim mb-2">CUSTOM TOOLS</div>
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
            <span className="font-pixel text-[10px] text-accent-amber shrink-0 mt-0.5">{'\u26A0'} WARNING</span>
            <div className="text-[12px] text-text-secondary">
              <p>Third-party MCP servers may access or modify files on your computer.</p>
              {mode === 'sandbox' && sandboxSupported && !applyToMCP && (
                <p className="mt-1 text-text-dim">
                  Enable "Apply to MCP" in Settings &gt; Permissions to sandbox MCP servers.
                </p>
              )}
              {mode === 'sandbox' && !sandboxSupported && (
                <p className="mt-1 text-text-dim">Sandbox runtime is not available on this platform.</p>
              )}
            </div>
          </div>
        </PixelCard>
      )}

      {/* Assigned servers */}
      <div className="font-pixel text-[8px] text-text-dim mb-2">ASSIGNED MCP SERVERS</div>
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
                    <PixelBadge variant="error">Restricted</PixelBadge>
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
        <p className="text-[12px] text-text-dim mb-2">No MCP servers assigned to this agent.</p>
      )}

      {/* Divider */}
      <div className="border-t border-border-dim my-4" />

      {/* Available servers picker */}
      {available.length > 0 && (
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-2">ADD MCP SERVER</div>
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
          <p className="text-[12px] text-text-dim mb-2">No MCP servers in this project</p>
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/mcp-servers`)}>
            Go to MCP Servers
          </PixelButton>
        </PixelCard>
      )}

      {/* Manage link */}
      {mcpServers.length > 0 && (
        <div className="mt-4">
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/mcp-servers`)}>
            Manage MCP Servers &rarr;
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
      <div className="font-pixel text-[8px] text-text-dim mb-2">ASSIGNED SUB-AGENTS</div>
      {agent.subAgents.length > 0 ? (
        <div className="flex flex-col gap-2">
          {agent.subAgents.map(sub => {
            const subAgent = agents.find(a => a.id === sub.agentId)
            return (
              <PixelCard key={sub.agentId} className="flex items-center gap-3">
                <PixelAvatar size="sm" initials={subAgent?.name ?? '??'} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-text-primary">{subAgent?.name ?? 'Unknown'}</div>
                  <input
                    className="bg-transparent text-[11px] text-accent-purple outline-none border-b border-transparent focus:border-accent-purple w-full"
                    value={sub.role}
                    onChange={e => updateRole(sub.agentId, e.target.value)}
                    placeholder="Role..."
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
        <p className="text-[12px] text-text-dim mb-2">No sub-agents assigned to this agent.</p>
      )}

      {/* Divider */}
      <div className="border-t border-border-dim my-4" />

      {/* Add sub-agent picker */}
      {available.length > 0 ? (
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-2">ADD SUB-AGENT</div>
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
        <p className="text-[12px] text-text-dim">No other agents available in this project.</p>
      )}
    </div>
  )
}

