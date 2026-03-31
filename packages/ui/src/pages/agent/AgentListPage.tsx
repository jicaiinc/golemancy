import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { AgentStatus, ProjectId } from '@golemancy/shared'
import { useAgents, useCloneAgent } from '../../queries/agents'
import { PixelButton, PixelCard, PixelBadge, PixelAvatar, PixelSpinner, CopyIcon } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { AgentCreateModal } from './AgentCreateModal'
import { getCloneName } from '../../lib/clone-name'

const statusBarColor: Record<AgentStatus, string> = {
  idle: 'bg-text-secondary',
  running: 'bg-accent-green',
  error: 'bg-accent-red',
}

const statusAnimation: Record<AgentStatus, string> = {
  idle: '',
  running: 'animate-[pixel-pulse_1s_steps(2)_infinite]',
  error: 'animate-[pixel-shake_0.3s_steps(3)_infinite]',
}

const statusBadgeVariant: Record<AgentStatus, 'idle' | 'running' | 'error'> = {
  idle: 'idle',
  running: 'running',
  error: 'error',
}

export function AgentListPage() {
  const { t } = useTranslation('agent')
  const { projectId } = useParams<{ projectId: string }>()
  const { data: agents = [], isLoading: agentsLoading } = useAgents(projectId as ProjectId | null)
  const cloneAgent = useCloneAgent()
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
          <h1 className="font-pixel text-[14px] text-text-primary">{t('list.title')}</h1>
          <p className="mt-1 text-text-secondary text-[13px]">
            {t('list.subtitle', { count: agents.length })}
          </p>
        </div>
        <PixelButton data-testid="create-agent-btn" variant="primary" onClick={() => setShowCreate(true)}>
          {t('list.newBtn')}
        </PixelButton>
      </div>

      {/* Agent grid */}
      {agents.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-12">
          <div className="font-arcade text-[20px] text-text-dim mb-4">{'{}'}</div>
          <p className="font-pixel text-[10px] text-text-secondary mb-4">{t('list.empty')}</p>
          <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
            {t('list.createFirst')}
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
                <div
                  data-testid={`agent-list-status-bar-${agent.id}`}
                  data-agent-status={agent.status}
                  className={`absolute top-0 left-0 right-0 h-1 ${statusBarColor[agent.status]} ${statusAnimation[agent.status]}`}
                />

                <div className="flex items-start gap-3 mt-1">
                  <PixelAvatar
                    size="md"
                    initials={agent.name}
                    status={agent.status === 'running' ? 'online' : agent.status === 'error' ? 'error' : 'offline'}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h3 className="font-pixel text-[10px] text-text-primary line-clamp-2 flex-1 min-w-0" title={agent.name}>{agent.name}</h3>
                      <PixelBadge
                        variant={statusBadgeVariant[agent.status]}
                        className="shrink-0"
                        data-testid={`agent-list-status-${agent.id}`}
                        data-agent-status={agent.status}
                      >
                        {t(`statusLabel.${agent.status}`)}
                      </PixelBadge>
                      <button
                        data-testid={`agent-clone-btn-${agent.id}`}
                        className="text-text-dim hover:text-accent-blue transition-colors p-1 shrink-0 opacity-0 group-hover:opacity-100"
                        title={t('list.clone')}
                        onClick={(e) => {
                          e.stopPropagation()
                          cloneAgent.mutate({ id: agent.id, newName: getCloneName(agent.name, agents.map(a => a.name)) })
                        }}
                      >
                        <CopyIcon className="w-[14px] h-[14px]" />
                      </button>
                    </div>
                    <p className="text-[12px] text-text-secondary mt-1 line-clamp-2">
                      {agent.description}
                    </p>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 mt-auto pt-3 border-t-2 border-border-dim">
                  {(agent.skillIds ?? []).length > 0 && (
                    <span className="text-[11px] text-text-dim">
                      {t('count.skills', { count: agent.skillIds.length })}
                    </span>
                  )}
                  {agent.tools.length > 0 && (
                    <span className="text-[11px] text-text-dim">
                      {t('count.tools', { count: agent.tools.length })}
                    </span>
                  )}
                  {agent.modelConfig?.model && (
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
