import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { AgentId } from '@golemancy/shared'
import { useNavigate, useParams } from 'react-router'
import { useAppStore } from '../../../stores'
import { PixelButton, PixelBadge, PixelAvatar } from '../../../components'

interface Props {
  agentId: AgentId
  onClose: () => void
}

export function NodeDetailPanel({ agentId, onClose }: Props) {
  const { t } = useTranslation('agent')
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
            <PixelBadge variant={agent.status}>{t(`statusLabel.${agent.status}`)}</PixelBadge>
          </div>
        </div>

        <p className="text-[12px] text-text-secondary mb-4 line-clamp-4">{agent.description}</p>

        {/* Model */}
        <div className="border-t-2 border-border-dim my-3" />
        <div className="mb-3">
          <div className="font-pixel text-[8px] text-text-dim mb-1">{t('panel.modelLabel')}</div>
          <div className="font-mono text-[12px] text-accent-blue">
            {agent.modelConfig.model ?? t('panel.inherited')}
          </div>
        </div>

        {/* Capabilities */}
        <div className="border-t-2 border-border-dim my-3" />
        <div className="mb-3">
          <div className="font-pixel text-[8px] text-text-dim mb-1">{t('panel.capabilities')}</div>
          <div className="flex flex-col gap-1 text-[11px] text-text-secondary font-mono">
            <span>{t('count.skills', { count: (agent.skillIds ?? []).length })}</span>
            <span>{t('count.tools', { count: agent.tools.length })}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t-2 border-border-dim my-3" />
        <div className="flex gap-2">
          <PixelButton
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => navigate(`/projects/${projectId}/agents/${agentId}`)}
          >
            {t('panel.openDetail')}
          </PixelButton>
        </div>
      </motion.div>
  )
}
