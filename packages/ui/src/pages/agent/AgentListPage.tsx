import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import type { AgentStatus } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { PixelButton, PixelCard, PixelBadge, PixelAvatar, PixelSpinner } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { AgentCreateModal } from './AgentCreateModal'

const statusBarColor: Record<AgentStatus, string> = {
  idle: 'bg-text-secondary',
  running: 'bg-accent-green',
  error: 'bg-accent-red',
  paused: 'bg-accent-amber',
}

const statusAnimation: Record<AgentStatus, string> = {
  idle: '',
  running: 'animate-[pixel-pulse_1s_steps(2)_infinite]',
  error: 'animate-[pixel-shake_0.3s_steps(3)_infinite]',
  paused: 'animate-[pixel-blink_2s_steps(2)_infinite]',
}

const statusBadgeVariant: Record<AgentStatus, 'idle' | 'running' | 'error' | 'paused'> = {
  idle: 'idle',
  running: 'running',
  error: 'error',
  paused: 'paused',
}

export function AgentListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const agents = useAppStore(s => s.agents)
  const agentsLoading = useAppStore(s => s.agentsLoading)
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  if (agentsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">Agents</h1>
          <p className="mt-1 text-text-secondary text-[13px]">
            {agents.length} agent{agents.length !== 1 ? 's' : ''} in this project
          </p>
        </div>
        <PixelButton data-testid="create-agent-btn" variant="primary" onClick={() => setShowCreate(true)}>
          + New Agent
        </PixelButton>
      </div>

      {/* Agent grid */}
      {agents.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-12">
          <div className="font-pixel text-[20px] text-text-dim mb-4">{'{}'}</div>
          <p className="font-pixel text-[10px] text-text-secondary mb-4">No agents yet</p>
          <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
            Create Your First Agent
          </PixelButton>
        </PixelCard>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          {...staggerContainer}
          initial="initial"
          animate="animate"
        >
          {agents.map(agent => (
            <motion.div key={agent.id} {...staggerItem} className="h-full">
              <PixelCard
                data-testid={`agent-item-${agent.id}`}
                variant="interactive"
                className="relative overflow-hidden group h-full flex flex-col"
                onClick={() => navigate(`/projects/${projectId}/agents/${agent.id}`)}
              >
                {/* Status bar - 4px colored top bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${statusBarColor[agent.status]} ${statusAnimation[agent.status]}`} />

                <div className="flex items-start gap-3 mt-1">
                  <PixelAvatar
                    size="md"
                    initials={agent.name}
                    status={agent.status === 'running' ? 'online' : agent.status === 'error' ? 'error' : agent.status === 'paused' ? 'paused' : 'offline'}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-pixel text-[10px] text-text-primary truncate">{agent.name}</h3>
                      <PixelBadge variant={statusBadgeVariant[agent.status]}>
                        {agent.status}
                      </PixelBadge>
                    </div>
                    <p className="text-[12px] text-text-secondary mt-1 line-clamp-2">
                      {agent.description}
                    </p>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 mt-auto pt-3 border-t-2 border-border-dim">
                  {agent.skills.length > 0 && (
                    <span className="text-[11px] text-text-dim">
                      {agent.skills.length} skill{agent.skills.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {agent.tools.length > 0 && (
                    <span className="text-[11px] text-text-dim">
                      {agent.tools.length} tool{agent.tools.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {agent.subAgents.length > 0 && (
                    <span className="text-[11px] text-accent-purple">
                      {agent.subAgents.length} sub-agent{agent.subAgents.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {agent.modelConfig.model && (
                    <span className="ml-auto text-[11px] text-text-dim font-mono">
                      {agent.modelConfig.model}
                    </span>
                  )}
                </div>
              </PixelCard>
            </motion.div>
          ))}
        </motion.div>
      )}

      <AgentCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
