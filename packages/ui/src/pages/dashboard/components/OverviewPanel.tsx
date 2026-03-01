import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { DashboardAgentStats, DashboardRecentChat } from '@golemancy/shared'
import { PixelCard, PixelAvatar, PixelBadge, PixelButton } from '../../../components'
import { formatTokens, relativeTime } from '../utils'

interface OverviewPanelProps {
  agentStats: DashboardAgentStats[]
  recentChats: DashboardRecentChat[]
}

const statusToAvatar: Record<string, 'online' | 'offline' | 'paused' | 'error'> = {
  running: 'online',
  idle: 'offline',
  paused: 'paused',
  error: 'error',
}

export function OverviewPanel({ agentStats, recentChats }: OverviewPanelProps) {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Agents */}
      <PixelCard variant="default">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-pixel text-[10px] text-text-secondary">{t('overview.agents')}</h3>
          <PixelButton size="sm" variant="ghost" onClick={() => navigate('agents')}>
            {t('overview.viewAll')}
          </PixelButton>
        </div>
        {agentStats.length === 0 ? (
          <p className="text-[10px] text-text-dim text-center py-4">{t('overview.noAgents')}</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {agentStats.map(agent => (
              <div
                key={agent.agentId}
                className="flex items-center gap-3 px-2 py-1.5 hover:bg-elevated/50 cursor-pointer transition-colors"
                onClick={() => navigate(`agents/${agent.agentId}`)}
              >
                <PixelAvatar
                  size="sm"
                  initials={agent.agentName}
                  status={statusToAvatar[agent.status] ?? 'offline'}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] text-text-primary truncate block">{agent.agentName}</span>
                  <span className="text-[9px] text-text-dim">{agent.model}</span>
                </div>
                <PixelBadge variant={agent.status === 'running' ? 'running' : agent.status === 'error' ? 'error' : 'idle'}>
                  {agent.status}
                </PixelBadge>
              </div>
            ))}
          </div>
        )}
      </PixelCard>

      {/* Recent Chats */}
      <PixelCard variant="default">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-pixel text-[10px] text-text-secondary">{t('overview.recentChats')}</h3>
          <PixelButton size="sm" variant="ghost" onClick={() => navigate('chat')}>
            {t('overview.viewAll')}
          </PixelButton>
        </div>
        {recentChats.length === 0 ? (
          <p className="text-[10px] text-text-dim text-center py-4">{t('overview.noRecentChats')}</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {recentChats.map(chat => (
              <div
                key={chat.conversationId}
                className="flex items-center gap-3 px-2 py-2 hover:bg-elevated/50 cursor-pointer transition-colors"
                onClick={() => navigate(`chat?conv=${chat.conversationId}`)}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-text-primary truncate">{chat.title}</div>
                  <div className="text-[10px] text-text-dim">@{chat.agentName}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-text-secondary font-mono">
                    {t('overview.chatStats', { count: chat.messageCount, tokens: formatTokens(chat.totalTokens) })}
                  </div>
                  <div className="text-[9px] text-text-dim font-mono">{relativeTime(chat.lastMessageAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PixelCard>
    </div>
  )
}
