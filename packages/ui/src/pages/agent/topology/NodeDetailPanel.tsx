import { motion } from 'motion/react'
import type { AgentId } from '@solocraft/shared'
import { useNavigate, useParams } from 'react-router'
import { useAppStore } from '../../../stores'
import { PixelButton, PixelBadge, PixelAvatar } from '../../../components'

interface Props {
  agentId: AgentId
  onClose: () => void
}

export function NodeDetailPanel({ agentId, onClose }: Props) {
  const agents = useAppStore(s => s.agents)
  const agent = agents.find(a => a.id === agentId)
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  if (!agent) return null

  const statusMap = {
    running: 'online' as const,
    error: 'error' as const,
    paused: 'paused' as const,
    idle: 'offline' as const,
  }

  return (
      <motion.div
        key={agentId}
        initial={{ x: 320, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 320, opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="absolute top-0 right-0 h-full w-[320px] bg-deep border-l-2 border-border-dim shadow-pixel-drop p-4 overflow-y-auto z-10"
      >
        {/* Close button */}
        <PixelButton variant="ghost" size="sm" onClick={onClose} className="absolute top-4 right-4">
          &times;
        </PixelButton>

        {/* Agent header */}
        <div className="flex items-center gap-3 mb-4 pr-8">
          <PixelAvatar size="md" initials={agent.name} status={statusMap[agent.status]} />
          <div className="min-w-0">
            <h3 className="font-pixel text-[10px] text-text-primary truncate">{agent.name}</h3>
            <PixelBadge variant={agent.status}>{agent.status}</PixelBadge>
          </div>
        </div>

        <p className="text-[12px] text-text-secondary mb-4 line-clamp-4">{agent.description}</p>

        {/* Model */}
        <div className="border-t-2 border-border-dim my-3" />
        <div className="mb-3">
          <div className="font-pixel text-[8px] text-text-dim mb-1">MODEL</div>
          <div className="font-mono text-[12px] text-accent-blue">
            {agent.modelConfig.model ?? 'Inherited'}
          </div>
        </div>

        {/* Capabilities */}
        <div className="border-t-2 border-border-dim my-3" />
        <div className="mb-3">
          <div className="font-pixel text-[8px] text-text-dim mb-1">CAPABILITIES</div>
          <div className="flex flex-col gap-1 text-[11px] text-text-secondary font-mono">
            <span>{(agent.skillIds ?? []).length} skill{(agent.skillIds ?? []).length !== 1 ? 's' : ''}</span>
            <span>{agent.tools.length} tool{agent.tools.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Sub-Agents */}
        {agent.subAgents.length > 0 && (
          <>
            <div className="border-t-2 border-border-dim my-3" />
            <div className="mb-3">
              <div className="font-pixel text-[8px] text-text-dim mb-1">SUB-AGENTS</div>
              <div className="flex flex-col gap-1 text-[11px] font-mono">
                {agent.subAgents.map(sub => {
                  const subAgent = agents.find(a => a.id === sub.agentId)
                  return (
                    <span key={sub.agentId} className="text-accent-purple">
                      → {subAgent?.name ?? sub.agentId} ({sub.role})
                    </span>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="border-t-2 border-border-dim my-3" />
        <div className="flex gap-2">
          <PixelButton
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => navigate(`/projects/${projectId}/agents/${agentId}`)}
          >
            Open Detail
          </PixelButton>
        </div>
      </motion.div>
  )
}
