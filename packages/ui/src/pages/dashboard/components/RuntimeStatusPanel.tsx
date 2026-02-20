import { useState } from 'react'
import type { RuntimeStatus, ProjectId, ConversationId, CronJobId } from '@golemancy/shared'
import { PixelCard, PixelTabs, PixelBadge } from '../../../components'
import { relativeTime, formatDuration, formatTokens } from '../utils'

interface RuntimeStatusPanelProps {
  status: RuntimeStatus | null
  showProject?: boolean
  onOpenChat?: (conversationId: ConversationId, projectId: ProjectId) => void
  onOpenCron?: (cronJobId: CronJobId, projectId: ProjectId) => void
}

export function RuntimeStatusPanel({ status, showProject, onOpenChat, onOpenCron }: RuntimeStatusPanelProps) {
  const [tab, setTab] = useState('active')

  if (!status) return null

  const tabs = [
    { id: 'active', label: `Active (${status.runningChats.length + status.runningCrons.length})` },
    { id: 'scheduled', label: `Scheduled (${status.upcoming.length})` },
    { id: 'recent', label: 'Recent' },
  ]

  return (
    <PixelCard variant="default">
      <h3 className="font-pixel text-[10px] text-text-secondary mb-3">ACTIVITY</h3>
      <PixelTabs tabs={tabs} activeTab={tab} onTabChange={setTab} />

      <div className="mt-3 min-h-[80px]">
        {tab === 'active' && (
          <ActiveTab chats={status.runningChats} crons={status.runningCrons} showProject={showProject} onOpenChat={onOpenChat} onOpenCron={onOpenCron} />
        )}
        {tab === 'scheduled' && (
          <ScheduledTab items={status.upcoming} showProject={showProject} onOpenCron={onOpenCron} />
        )}
        {tab === 'recent' && (
          <RecentTab items={status.recentCompleted} showProject={showProject} onOpenChat={onOpenChat} onOpenCron={onOpenCron} />
        )}
      </div>
    </PixelCard>
  )
}

/** Consistent badge width so titles align across rows */
const badgeClass = 'min-w-[4.5rem] text-center'

function OpenLink({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      className="font-pixel text-[8px] text-accent-cyan hover:text-accent-blue transition-colors cursor-pointer shrink-0"
      onClick={onClick}
    >
      OPEN &rarr;
    </button>
  )
}

function ActiveTab({
  chats, crons, showProject, onOpenChat, onOpenCron,
}: {
  chats: RuntimeStatus['runningChats']
  crons: RuntimeStatus['runningCrons']
  showProject?: boolean
  onOpenChat?: (conversationId: ConversationId, projectId: ProjectId) => void
  onOpenCron?: (cronJobId: CronJobId, projectId: ProjectId) => void
}) {
  if (chats.length === 0 && crons.length === 0) {
    return <p className="text-[10px] text-text-dim text-center py-4">No active runs</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {chats.map(c => (
        <div key={c.conversationId} className="flex items-center gap-3 px-2 py-1.5 hover:bg-elevated/50 transition-colors">
          <div className={badgeClass}><PixelBadge variant="running">Chat</PixelBadge></div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-text-primary truncate block">{c.title || c.conversationId}</span>
            <span className="text-[9px] text-text-dim">
              {showProject && c.projectName ? `${c.projectName} · ` : ''}@{c.agentName}
            </span>
          </div>
          <span className="text-[9px] text-text-dim font-mono shrink-0">{relativeTime(c.startedAt)}</span>
          {onOpenChat && (
            <OpenLink onClick={(e) => { e.stopPropagation(); onOpenChat(c.conversationId, c.projectId) }} />
          )}
        </div>
      ))}
      {crons.map(c => (
        <div key={c.runId} className="flex items-center gap-3 px-2 py-1.5 hover:bg-elevated/50 transition-colors">
          <div className={badgeClass}><PixelBadge variant="info">Cron</PixelBadge></div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-text-primary truncate block">{c.cronJobName}</span>
            <span className="text-[9px] text-text-dim">
              {showProject && c.projectName ? `${c.projectName} · ` : ''}@{c.agentName}
            </span>
          </div>
          <span className="text-[9px] text-text-dim font-mono shrink-0">{relativeTime(c.startedAt)}</span>
          {onOpenCron && (
            <OpenLink onClick={(e) => { e.stopPropagation(); onOpenCron(c.cronJobId, c.projectId) }} />
          )}
        </div>
      ))}
    </div>
  )
}

function ScheduledTab({
  items, showProject, onOpenCron,
}: {
  items: RuntimeStatus['upcoming']
  showProject?: boolean
  onOpenCron?: (cronJobId: CronJobId, projectId: ProjectId) => void
}) {
  if (items.length === 0) {
    return <p className="text-[10px] text-text-dim text-center py-4">No scheduled runs</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map(item => (
        <div key={`${item.cronJobId}-${item.nextRunAt}`} className="flex items-center gap-3 px-2 py-1.5 hover:bg-elevated/50 transition-colors">
          <div className={badgeClass}><PixelBadge variant="info">Cron</PixelBadge></div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-text-primary truncate block">{item.cronJobName}</span>
            <span className="text-[9px] text-text-dim">
              {showProject && item.projectName ? `${item.projectName} · ` : ''}@{item.agentName}
            </span>
          </div>
          <span className="text-[9px] text-text-dim font-mono shrink-0">{relativeTime(item.nextRunAt)}</span>
          {onOpenCron && (
            <OpenLink onClick={(e) => { e.stopPropagation(); onOpenCron(item.cronJobId, item.projectId) }} />
          )}
        </div>
      ))}
    </div>
  )
}

function RecentTab({
  items, showProject, onOpenChat, onOpenCron,
}: {
  items: RuntimeStatus['recentCompleted']
  showProject?: boolean
  onOpenChat?: (conversationId: ConversationId, projectId: ProjectId) => void
  onOpenCron?: (cronJobId: CronJobId, projectId: ProjectId) => void
}) {
  if (items.length === 0) {
    return <p className="text-[10px] text-text-dim text-center py-4">No recent activity</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map(item => {
        const isChat = item.type === 'chat'
        return (
          <div
            key={`${item.type}-${item.id}`}
            className="flex items-center gap-3 px-2 py-1.5 hover:bg-elevated/50 transition-colors"
          >
            <div className={badgeClass}>
              <PixelBadge variant={item.status === 'error' ? 'error' : isChat ? 'success' : 'info'}>
                {isChat ? 'Chat' : 'Cron'}
              </PixelBadge>
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] text-text-primary truncate block">{item.title || item.id}</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-text-dim">
                  {showProject && item.projectName ? `${item.projectName} · ` : ''}@{item.agentName}
                </span>
                {item.durationMs != null && (
                  <span className="text-[9px] text-text-dim">{formatDuration(item.durationMs)}</span>
                )}
                {item.totalTokens != null && item.totalTokens > 0 && (
                  <span className="text-[9px] text-text-dim">{formatTokens(item.totalTokens)} tokens</span>
                )}
              </div>
            </div>
            <span className="text-[9px] text-text-dim font-mono shrink-0">{relativeTime(item.completedAt)}</span>
            {isChat && onOpenChat && (
              <OpenLink onClick={(e) => { e.stopPropagation(); onOpenChat(item.id as ConversationId, item.projectId) }} />
            )}
            {!isChat && onOpenCron && item.cronJobId && (
              <OpenLink onClick={(e) => { e.stopPropagation(); onOpenCron(item.cronJobId!, item.projectId) }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
