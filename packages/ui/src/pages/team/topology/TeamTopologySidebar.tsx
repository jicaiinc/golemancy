import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import type { Agent, AgentId, Team, ProjectId } from '@golemancy/shared'
import { PixelButton } from '../../../components'
import { useAppStore } from '../../../stores'
import { getServices } from '../../../services'

type SidebarMode = 'agents' | 'detail' | 'settings'

interface TeamTopologySidebarProps {
  team: Team
  agents: Agent[]
  mode: SidebarMode
  isOpen: boolean
  selectedAgentId: AgentId | null
  onClose: () => void
  onRemove: (agentId: AgentId) => void
}

export function TeamTopologySidebar({
  team, agents, mode, isOpen, selectedAgentId, onClose, onRemove,
}: TeamTopologySidebarProps) {
  const { t } = useTranslation('team')

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'tween', duration: 0.2 }}
          className="h-full bg-surface border-l-2 border-border-dim flex flex-col overflow-hidden shrink-0"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b-2 border-border-dim flex items-center justify-between shrink-0">
            <span className="font-pixel text-[9px] text-text-dim">
              {mode === 'agents' && t('topology.sidebar.agents')}
              {mode === 'detail' && t('topology.sidebar.detail')}
              {mode === 'settings' && t('topology.sidebar.settings')}
            </span>
            <button
              onClick={onClose}
              className="font-pixel text-[11px] text-text-dim hover:text-text-primary cursor-pointer leading-none"
            >
              &times;
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-w-[280px]">
            {mode === 'agents' && (
              <AgentsPanel agents={agents} team={team} />
            )}
            {mode === 'detail' && selectedAgentId && (
              <DetailPanel
                agentId={selectedAgentId}
                agents={agents}
                team={team}
                onRemove={onRemove}
              />
            )}
            {mode === 'settings' && (
              <SettingsPanel team={team} agents={agents} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ── Agents Panel ──────────────────────────────────── */

function AgentsPanel({ agents, team }: { agents: Agent[]; team: Team }) {
  const { t } = useTranslation('team')
  const memberIds = new Set(team.members.map(m => m.agentId))

  return (
    <div className="py-1">
      {agents.map(agent => {
        const inTeam = memberIds.has(agent.id)
        return (
          <div
            key={agent.id}
            draggable={!inTeam}
            onDragStart={e => {
              if (inTeam) { e.preventDefault(); return }
              e.dataTransfer.setData('application/golemancy-agent', agent.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            className={`px-3 py-2 border-b border-border-dim transition-colors ${
              inTeam
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-grab hover:bg-elevated active:cursor-grabbing'
            }`}
          >
            <div className="flex items-center gap-2">
              {!inTeam && (
                <span className="font-mono text-[11px] text-text-dim opacity-40 shrink-0 leading-none select-none">⠿</span>
              )}
              <span className="font-pixel text-[9px] text-text-primary truncate flex-1">
                {agent.name}
              </span>
              {inTeam && (
                <span className="font-mono text-[7px] text-text-dim shrink-0">
                  {t('topology.sidebar.inTeam')}
                </span>
              )}
            </div>
            {agent.modelConfig.model && (
              <div className="font-mono text-[8px] text-text-dim truncate mt-0.5">
                {agent.modelConfig.model}
              </div>
            )}
          </div>
        )
      })}
      {agents.length === 0 && (
        <div className="px-3 py-4 font-mono text-[9px] text-text-dim text-center">
          {t('topology.noAgentsAvailable')}
        </div>
      )}
      {agents.length > 0 && (
        <div className="px-3 py-3 font-mono text-[8px] text-text-dim text-center leading-relaxed">
          {t('topology.clickNodeHint')}
        </div>
      )}
    </div>
  )
}

/* ── Detail Panel ──────────────────────────────────── */

function DetailPanel({
  agentId, agents, team, onRemove,
}: {
  agentId: AgentId
  agents: Agent[]
  team: Team
  onRemove: (agentId: AgentId) => void
}) {
  const { t } = useTranslation('team')
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const skills = useAppStore(s => s.skills)

  const agent = agents.find(a => a.id === agentId) ?? null
  const member = team.members.find(m => m.agentId === agentId)
  const leaderId = team.members.find(m => !m.parentAgentId)?.agentId
  const isLeader = member?.agentId === leaderId
  const hasMemory = agent != null && agent.builtinTools?.memory !== false

  // Memory count
  const [memoryCount, setMemoryCount] = useState<number | null>(null)
  useEffect(() => {
    if (!agentId || !hasMemory || !projectId) {
      setMemoryCount(null)
      return
    }
    let cancelled = false
    getServices().memories.list(projectId as ProjectId, agentId)
      .then(mems => { if (!cancelled) setMemoryCount(mems.length) })
      .catch(() => { if (!cancelled) setMemoryCount(null) })
    return () => { cancelled = true }
  }, [agentId, hasMemory, projectId])

  if (!agent) return null

  const agentSkills = (agent.skillIds ?? [])
    .map(sid => skills.find(s => s.id === sid))
    .filter(Boolean) as { id: string; name: string }[]
  const enabledTools = Object.entries(agent.builtinTools)
    .filter(([, v]) => !!v)
    .map(([k]) => k)
  const mcpServers = agent.mcpServers ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Agent info */}
      <div className="p-3 border-b-2 border-border-dim">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-pixel text-[11px] text-text-primary truncate flex-1">{agent.name}</span>
          {isLeader && (
            <span className="font-pixel text-[7px] text-mc-gold border border-mc-gold px-1 leading-[14px] shrink-0">
              {t('topology.leader')}
            </span>
          )}
        </div>
        {agent.description && (
          <p className="text-[10px] text-text-secondary line-clamp-2">{agent.description}</p>
        )}
        {agent.modelConfig.model && (
          <div className="font-mono text-[10px] text-accent-blue mt-1">{agent.modelConfig.model}</div>
        )}
      </div>

      {/* Capabilities */}
      <div className="p-3 flex flex-col gap-3 flex-1">
        {/* Skills */}
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-1">
            {t('topology.skills')} ({agentSkills.length})
          </div>
          {agentSkills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {agentSkills.map(s => (
                <span key={s.id} className="font-mono text-[9px] text-accent-purple bg-accent-purple/10 px-1.5 py-0.5 border border-accent-purple/20">
                  {s.name}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[9px] text-text-dim">{t('topology.noSkills')}</span>
          )}
        </div>

        {/* Tools */}
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-1">
            {t('topology.tools')} ({enabledTools.length})
          </div>
          {enabledTools.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {enabledTools.map(tool => (
                <span key={tool} className="font-mono text-[9px] text-accent-green bg-accent-green/10 px-1.5 py-0.5 border border-accent-green/20">
                  {tool}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[9px] text-text-dim">{t('topology.noTools')}</span>
          )}
        </div>

        {/* MCP Servers */}
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-1">
            {t('topology.mcpServers')} ({mcpServers.length})
          </div>
          {mcpServers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {mcpServers.map(name => (
                <span key={name} className="font-mono text-[9px] text-accent-cyan bg-accent-cyan/10 px-1.5 py-0.5 border border-accent-cyan/20">
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[9px] text-text-dim">{t('topology.noMcpServers')}</span>
          )}
        </div>

        {/* Memory */}
        <div>
          <div className="font-pixel text-[8px] text-text-dim mb-1">{t('topology.memory')}</div>
          {hasMemory ? (
            <button
              className="font-mono text-[9px] text-accent-amber hover:underline cursor-pointer"
              onClick={() => navigate(`/projects/${projectId}/agents/${agent.id}`, { state: { tab: 'memory' } })}
            >
              {memoryCount !== null ? t('topology.memoryCount', { count: memoryCount }) : t('topology.memoryEnabled')}
              {' \u2192'}
            </button>
          ) : (
            <span className="font-mono text-[9px] text-text-dim">{t('topology.memoryDisabled')}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-t-2 border-border-dim flex flex-col gap-1.5 shrink-0">
        <PixelButton
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => navigate(`/projects/${projectId}/agents/${agent.id}`)}
        >
          {t('topology.openDetail')}
        </PixelButton>
        <PixelButton
          variant="danger"
          size="sm"
          className="w-full justify-center"
          onClick={() => onRemove(agent.id)}
        >
          {t('topology.removeMember')}
        </PixelButton>
      </div>
    </div>
  )
}

/* ── Settings Panel ────────────────────────────────── */

function SettingsPanel({ team, agents }: { team: Team; agents: Agent[] }) {
  const { t } = useTranslation('team')
  const updateTeam = useAppStore(s => s.updateTeam)

  const [description, setDescription] = useState(team.description)
  const [instruction, setInstruction] = useState(team.instruction ?? '')
  const [saved, setSaved] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setDescription(team.description)
    setInstruction(team.instruction ?? '')
  }, [team.description, team.instruction])

  const flashSaved = useCallback(() => {
    setSaved(true)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000)
  }, [])

  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  async function saveDescription() {
    if (description !== team.description) {
      await updateTeam(team.id, { description: description.trim() })
      flashSaved()
    }
  }

  async function saveInstruction() {
    const val = instruction.trim() || undefined
    if (val !== (team.instruction ?? undefined)) {
      await updateTeam(team.id, { instruction: val })
      flashSaved()
    }
  }

  return (
    <div className="p-3 flex flex-col gap-4">
      {saved && (
        <span className="text-accent-green text-[10px] font-pixel">{t('detail.savedMsg')}</span>
      )}

      {/* Description */}
      <div>
        <div className="font-pixel text-[8px] text-text-dim mb-1">{t('topology.description')}</div>
        <textarea
          className="w-full h-16 bg-deep px-2 py-1.5 font-mono text-[11px] text-text-primary border-2 border-border-dim outline-none focus:border-accent-blue resize-none"
          placeholder={t('topology.descriptionPlaceholder')}
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={saveDescription}
        />
      </div>

      {/* Instruction */}
      <div>
        <div className="font-pixel text-[8px] text-text-dim mb-1">{t('topology.instruction')}</div>
        <textarea
          className="w-full h-32 bg-deep px-2 py-1.5 font-mono text-[11px] text-text-primary border-2 border-border-dim outline-none focus:border-accent-blue resize-none"
          placeholder={t('topology.instructionPlaceholder')}
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onBlur={saveInstruction}
        />
      </div>

      {/* Members summary */}
      <div>
        <div className="font-pixel text-[8px] text-text-dim mb-1">
          {t('list.members', { count: team.members.length })}
        </div>
        <div className="flex flex-col gap-1">
          {team.members.map((m, _i, arr) => {
            const settingsLeaderId = arr.find(x => !x.parentAgentId)?.agentId
            const isLeader = m.agentId === settingsLeaderId
            const agent = agents.find(a => a.id === m.agentId)
            return (
              <div key={m.agentId} className="flex items-center gap-1.5 font-mono text-[9px] text-text-secondary">
                <span className="truncate">{agent?.name ?? m.agentId}</span>
                {isLeader && <span className="text-mc-gold text-[8px]">★</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
