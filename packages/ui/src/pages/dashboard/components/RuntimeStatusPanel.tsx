import { useState } from 'react'
import type { RuntimeStatus } from '@golemancy/shared'
import { PixelCard, PixelTabs, PixelBadge } from '../../../components'
import { relativeTime, formatDuration } from '../utils'

interface RuntimeStatusPanelProps {
  status: RuntimeStatus | null
}

export function RuntimeStatusPanel({ status }: RuntimeStatusPanelProps) {
  const [tab, setTab] = useState('running')

  if (!status) return null

  const tabs = [
    { id: 'running', label: `Running (${status.runningChats.length + status.runningCrons.length})` },
    { id: 'upcoming', label: `Upcoming (${status.upcoming.length})` },
    { id: 'recent', label: 'Recent' },
  ]

  return (
    <PixelCard variant="default">
      <h3 className="font-pixel text-[10px] text-text-secondary mb-3">RUNTIME STATUS</h3>
      <PixelTabs tabs={tabs} activeTab={tab} onTabChange={setTab} />

      <div className="mt-3 min-h-[80px]">
        {tab === 'running' && (
          <RunningTab chats={status.runningChats} crons={status.runningCrons} />
        )}
        {tab === 'upcoming' && (
          <UpcomingTab items={status.upcoming} />
        )}
        {tab === 'recent' && (
          <RecentTab items={status.recentCompleted} />
        )}
      </div>
    </PixelCard>
  )
}

function RunningTab({ chats, crons }: { chats: RuntimeStatus['runningChats']; crons: RuntimeStatus['runningCrons'] }) {
  if (chats.length === 0 && crons.length === 0) {
    return <p className="text-[10px] text-text-dim text-center py-4">No running tasks</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {chats.map(c => (
        <div key={c.conversationId} className="flex items-center gap-3 px-2 py-1.5">
          <PixelBadge variant="running">Chat</PixelBadge>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-text-primary truncate block">{c.title}</span>
            <span className="text-[9px] text-text-dim">@{c.agentName}</span>
          </div>
          <span className="text-[9px] text-text-dim font-mono shrink-0">{relativeTime(c.startedAt)}</span>
        </div>
      ))}
      {crons.map(c => (
        <div key={c.runId} className="flex items-center gap-3 px-2 py-1.5">
          <PixelBadge variant="running">Cron</PixelBadge>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-text-primary truncate block">{c.cronJobName}</span>
            <span className="text-[9px] text-text-dim">@{c.agentName}</span>
          </div>
          <span className="text-[9px] text-text-dim font-mono shrink-0">{relativeTime(c.startedAt)}</span>
        </div>
      ))}
    </div>
  )
}

function UpcomingTab({ items }: { items: RuntimeStatus['upcoming'] }) {
  if (items.length === 0) {
    return <p className="text-[10px] text-text-dim text-center py-4">No upcoming tasks</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map(item => (
        <div key={item.cronJobId} className="flex items-center gap-3 px-2 py-1.5">
          <PixelBadge variant="info">Cron</PixelBadge>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-text-primary truncate block">{item.cronJobName}</span>
            <span className="text-[9px] text-text-dim">@{item.agentName}</span>
          </div>
          <span className="text-[9px] text-text-dim font-mono shrink-0">{relativeTime(item.nextRunAt)}</span>
        </div>
      ))}
    </div>
  )
}

function RecentTab({ items }: { items: RuntimeStatus['recentCompleted'] }) {
  if (items.length === 0) {
    return <p className="text-[10px] text-text-dim text-center py-4">No recent items</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3 px-2 py-1.5">
          <PixelBadge variant={item.status === 'success' ? 'success' : 'error'}>
            {item.type === 'chat' ? 'Chat' : 'Cron'}
          </PixelBadge>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-text-primary truncate block">@{item.agentName}</span>
            {item.durationMs != null && (
              <span className="text-[9px] text-text-dim">{formatDuration(item.durationMs)}</span>
            )}
          </div>
          <span className="text-[9px] text-text-dim font-mono shrink-0">{relativeTime(item.completedAt)}</span>
        </div>
      ))}
    </div>
  )
}
