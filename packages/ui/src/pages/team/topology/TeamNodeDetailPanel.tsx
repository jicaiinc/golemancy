import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import type { Agent, AgentId, ProjectId } from '@golemancy/shared'
import { PixelButton } from '../../../components'
import { useAppStore } from '../../../stores'
import { getServices } from '../../../services'

interface TeamNodeDetailPanelProps {
  agent: Agent | null
  isLeader: boolean
  onClose: () => void
  onRemove: (agentId: AgentId) => void
}

export function TeamNodeDetailPanel({
  agent, isLeader, onClose, onRemove,
}: TeamNodeDetailPanelProps) {
  const { t } = useTranslation('team')
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const skills = useAppStore(s => s.skills)
  const [memoryCount, setMemoryCount] = useState<number | null>(null)

  // Load memory count for selected agent
  const agentId = agent?.id
  const hasMemory = agent?.builtinTools?.memory !== false
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

  // Derived capability data (safe when agent is null)
  const agentSkills = agent
    ? (agent.skillIds ?? []).map(sid => skills.find(s => s.id === sid)).filter(Boolean) as { id: string; name: string }[]
    : []
  const enabledTools = agent
    ? Object.entries(agent.builtinTools).filter(([, v]) => !!v).map(([k]) => k)
    : []
  const mcpServers = agent?.mcpServers ?? []

  return (
    <AnimatePresence>
      {agent && (
        <motion.div
          key="detail-panel"
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ type: 'tween', duration: 0.2 }}
          className="absolute top-0 right-0 w-[300px] h-full bg-surface border-l-2 border-border-dim z-50 flex flex-col overflow-y-auto"
        >
          {/* Header */}
          <div className="p-3 border-b-2 border-border-dim">
            <div className="flex items-center justify-between mb-2">
              <button onClick={onClose} className="font-pixel text-[9px] text-text-dim hover:text-text-primary cursor-pointer">
                &times;
              </button>
              {isLeader && (
                <span className="font-pixel text-[7px] text-mc-gold border border-mc-gold px-1 leading-[14px]">
                  {t('topology.leader')}
                </span>
              )}
            </div>
            <div className="font-pixel text-[11px] text-text-primary truncate">{agent.name}</div>
            {agent.description && (
              <p className="text-[10px] text-text-secondary mt-0.5 line-clamp-2">{agent.description}</p>
            )}
            {agent.modelConfig.model && (
              <div className="font-mono text-[10px] text-accent-blue mt-1">{agent.modelConfig.model}</div>
            )}
          </div>

          {/* Body */}
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
                  {memoryCount !== null ? `${memoryCount} memories` : t('topology.memoryEnabled')}
                  {' \u2192'}
                </button>
              ) : (
                <span className="font-mono text-[9px] text-text-dim">{t('topology.memoryDisabled')}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-3 border-t-2 border-border-dim flex flex-col gap-1.5">
            <PixelButton
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              onClick={() => navigate(`/projects/${projectId}/agents/${agent.id}`)}
            >
              {t('topology.openDetail')}
            </PixelButton>
            {!isLeader && (
              <PixelButton
                variant="danger"
                size="sm"
                className="w-full justify-center"
                onClick={() => onRemove(agent.id)}
              >
                {t('topology.removeMember')}
              </PixelButton>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
