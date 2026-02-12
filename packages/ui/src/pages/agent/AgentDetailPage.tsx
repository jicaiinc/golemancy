import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import type { Agent, AgentId, AgentStatus, AIProvider, SkillId } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject, useResolvedConfig } from '../../hooks'
import {
  PixelButton, PixelCard, PixelBadge, PixelAvatar, PixelTabs,
  PixelInput, PixelTextArea,
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
  { id: 'info', label: 'Info' },
  { id: 'skills', label: 'Skills' },
  { id: 'tools', label: 'Tools' },
  { id: 'mcp', label: 'MCP' },
  { id: 'sub-agents', label: 'Sub-Agents' },
  { id: 'model', label: 'Model Config' },
]

export function AgentDetailPage() {
  const { projectId, agentId } = useParams<{ projectId: string; agentId: string }>()
  const agents = useAppStore(s => s.agents)
  const updateAgent = useAppStore(s => s.updateAgent)
  const deleteAgent = useAppStore(s => s.deleteAgent)
  const navigate = useNavigate()

  const agent = agents.find(a => a.id === agentId)
  const [activeTab, setActiveTab] = useState('info')

  if (!agent) {
    return (
      <div className="p-6">
        <p className="text-text-dim">Agent not found.</p>
        <PixelButton variant="ghost" className="mt-2" onClick={() => navigate(`/projects/${projectId}/agents`)}>
          &lt; Back to Agents
        </PixelButton>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/agents`)}>
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
        {activeTab === 'info' && <InfoTab agent={agent} onUpdate={updateAgent} onDelete={async () => { await deleteAgent(agent.id); navigate(`/projects/${projectId}/agents`) }} />}
        {activeTab === 'skills' && <SkillsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'tools' && <ToolsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'mcp' && <MCPTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'sub-agents' && <SubAgentsTab agent={agent} onUpdate={updateAgent} />}
        {activeTab === 'model' && <ModelConfigTab agent={agent} onUpdate={updateAgent} />}
      </div>
    </div>
  )
}

// ========== Info Tab ==========
function InfoTab({ agent, onUpdate, onDelete }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
  onDelete: () => Promise<void>
}) {
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
    await onUpdate(agent.id, { name: name.trim(), description: description.trim(), systemPrompt: systemPrompt.trim() })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-[640px] flex flex-col gap-4">
      <PixelInput label="NAME" value={name} onChange={e => setName(e.target.value)} />
      <PixelInput label="DESCRIPTION" value={description} onChange={e => setDescription(e.target.value)} />
      <PixelTextArea label="SYSTEM PROMPT" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={8} />
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
      {assigned.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
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
      )}

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

      {assigned.length === 0 && available.length === 0 && (
        <PixelCard variant="outlined" className="text-center py-8">
          <p className="text-[12px] text-text-dim mb-2">No skills in this project</p>
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/skills`)}>
            Go to Skills
          </PixelButton>
        </PixelCard>
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
    { id: 'bash', name: 'Bash', description: 'Execute bash commands, read and write files', available: true },
    { id: 'browser', name: 'Browser', description: 'Control web browser for automation', available: false },
    { id: 'os_control', name: 'OS Control', description: 'Desktop automation and system control', available: false },
  ]

  async function toggleBuiltinTool(toolId: string) {
    const current = agent.builtinTools[toolId] ?? (toolId === 'bash')
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
            const enabled = agent.builtinTools[tool.id] ?? (tool.id === 'bash')
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

  const assignedNames = agent.mcpServers ?? []
  const assigned = mcpServers.filter(s => assignedNames.includes(s.name))
  const available = mcpServers.filter(s => !assignedNames.includes(s.name))

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
      {/* Assigned servers */}
      {assigned.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {assigned.map(server => (
            <PixelCard key={server.name} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-pixel text-[9px] text-accent-purple">{server.name}</span>
                  <span className={`font-mono text-[9px] ${transportColors[server.transportType] ?? 'text-text-dim'}`}>
                    {server.transportType.toUpperCase()}
                  </span>
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
      )}

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

      {/* Manage link */}
      {mcpServers.length > 0 && (
        <div className="mt-4">
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/mcp-servers`)}>
            Manage MCP Servers &rarr;
          </PixelButton>
        </div>
      )}

      {assigned.length === 0 && available.length === 0 && (
        <PixelCard variant="outlined" className="text-center py-8">
          <p className="text-[12px] text-text-dim mb-2">No MCP servers in this project</p>
          <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/mcp-servers`)}>
            Go to MCP Servers
          </PixelButton>
        </PixelCard>
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
      {/* Current sub-agents */}
      {agent.subAgents.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
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
      )}

      {/* Add sub-agent picker */}
      {available.length > 0 && (
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
      )}

      {agent.subAgents.length === 0 && available.length === 0 && (
        <PixelCard variant="outlined" className="text-center py-8">
          <p className="text-[12px] text-text-dim">No other agents in this project</p>
        </PixelCard>
      )}
    </div>
  )
}

// ========== Model Config Tab ==========
function ModelConfigTab({ agent, onUpdate }: {
  agent: Agent
  onUpdate: (id: AgentId, data: Partial<Agent>) => Promise<void>
}) {
  const project = useCurrentProject()
  const settings = useAppStore(s => s.settings)
  const resolvedConfig = useResolvedConfig(project?.config, agent.modelConfig)

  const [provider, setProvider] = useState(agent.modelConfig.provider ?? '')
  const [model, setModel] = useState(agent.modelConfig.model ?? '')
  const [temperature, setTemperature] = useState(agent.modelConfig.temperature ?? 0.7)
  const [maxTokens, setMaxTokens] = useState(agent.modelConfig.maxTokens ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setProvider(agent.modelConfig.provider ?? '')
    setModel(agent.modelConfig.model ?? '')
    setTemperature(agent.modelConfig.temperature ?? 0.7)
    setMaxTokens(agent.modelConfig.maxTokens ?? '')
  }, [agent.id])

  async function handleSave() {
    setSaving(true)
    await onUpdate(agent.id, {
      modelConfig: {
        ...(provider ? { provider: provider as AIProvider } : {}),
        ...(model ? { model } : {}),
        temperature,
        ...(maxTokens ? { maxTokens: Number(maxTokens) } : {}),
      },
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Determine inheritance source for each field
  function inheritLabel(field: 'provider' | 'model'): string {
    if (field === 'provider') {
      if (agent.modelConfig.provider) return 'Custom'
      if (project?.config.providerOverride?.provider) return 'Inherited from project'
      return 'Inherited from global'
    }
    if (agent.modelConfig.model) return 'Custom'
    if (project?.config.providerOverride?.defaultModel) return 'Inherited from project'
    return 'Inherited from global'
  }

  return (
    <div className="max-w-[640px] flex flex-col gap-4">
      {/* Effective config display */}
      {resolvedConfig && (
        <PixelCard className="bg-deep">
          <div className="font-pixel text-[8px] text-text-dim mb-2">EFFECTIVE CONFIG</div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div>
              <span className="text-text-dim">Provider: </span>
              <span className="text-accent-green font-mono">{resolvedConfig.provider}</span>
            </div>
            <div>
              <span className="text-text-dim">Model: </span>
              <span className="text-accent-green font-mono">{resolvedConfig.model}</span>
            </div>
            <div>
              <span className="text-text-dim">Temperature: </span>
              <span className="text-accent-green font-mono">{resolvedConfig.temperature}</span>
            </div>
            {resolvedConfig.maxTokens && (
              <div>
                <span className="text-text-dim">Max Tokens: </span>
                <span className="text-accent-green font-mono">{resolvedConfig.maxTokens}</span>
              </div>
            )}
          </div>
        </PixelCard>
      )}

      <div className="flex flex-col gap-1">
        <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">PROVIDER</label>
        <div className="flex items-center gap-2">
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer flex-1"
          >
            <option value="">Inherit</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="custom">Custom</option>
          </select>
          <span className="text-[10px] text-text-dim">{inheritLabel('provider')}</span>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <PixelInput label="MODEL" value={model} onChange={e => setModel(e.target.value)} placeholder="Inherit" />
        </div>
        <span className="text-[10px] text-text-dim pb-2">{inheritLabel('model')}</span>
      </div>

      <PixelInput
        label="TEMPERATURE"
        type="number"
        min={0}
        max={2}
        step={0.1}
        value={temperature}
        onChange={e => setTemperature(Number(e.target.value))}
      />

      <PixelInput
        label="MAX TOKENS"
        type="number"
        min={1}
        value={maxTokens}
        onChange={e => setMaxTokens(e.target.value ? Number(e.target.value) : '')}
        placeholder="Default"
      />

      <div className="flex items-center gap-3">
        <PixelButton variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Model Config'}
        </PixelButton>
        {saved && <span className="text-[12px] text-accent-green">Saved!</span>}
      </div>
    </div>
  )
}
