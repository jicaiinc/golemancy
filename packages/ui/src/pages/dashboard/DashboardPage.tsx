import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import type { ProjectId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelCard, PixelButton, PixelSpinner } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

function relativeTime(iso: string | null): string {
  if (!iso) return '--'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// --- Summary Cards ---
function SummaryCards() {
  const summary = useAppStore(s => s.dashboardSummary)
  if (!summary) return null

  const cards = [
    {
      label: 'Today Tokens',
      value: formatTokens(summary.todayTokens.total),
      sub: `${formatTokens(summary.todayTokens.input)} in / ${formatTokens(summary.todayTokens.output)} out`,
      icon: '$>',
      color: 'text-accent-amber',
    },
    {
      label: 'Agents',
      value: summary.totalAgents,
      sub: '\u00A0',
      icon: '{}',
      color: 'text-accent-blue',
    },
    {
      label: 'Active Chats',
      value: summary.activeChats,
      sub: '\u00A0',
      icon: '>_',
      color: 'text-accent-green',
    },
    {
      label: 'Total Chats',
      value: summary.totalChats,
      sub: '\u00A0',
      icon: '[#]',
      color: 'text-accent-cyan',
    },
  ]

  return (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      {...staggerContainer}
      initial="initial"
      animate="animate"
    >
      {cards.map(card => (
        <motion.div key={card.label} {...staggerItem}>
          <PixelCard variant="default" className="text-center py-4 px-3">
            <div className={`font-mono text-[14px] mb-2 ${card.color}`}>{card.icon}</div>
            <div className="font-pixel text-[14px] text-text-primary">
              {card.value}
            </div>
            <div className="text-[10px] text-text-dim mt-1">{card.label}</div>
            <div className="text-[9px] text-text-dim mt-0.5">{card.sub}</div>
          </PixelCard>
        </motion.div>
      ))}
    </motion.div>
  )
}

// --- Token Trend Chart (pure div + Tailwind, no chart library) ---
function TokenTrendChart() {
  const tokenTrend = useAppStore(s => s.dashboardTokenTrend)
  const [range, setRange] = useState<7 | 30>(7)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const data = useMemo(() => tokenTrend.slice(-range), [tokenTrend, range])

  const maxTotal = useMemo(() => {
    if (data.length === 0) return 1
    return Math.max(...data.map(d => d.inputTokens + d.outputTokens), 1)
  }, [data])

  if (data.length === 0) {
    return (
      <PixelCard variant="default" className="py-8 text-center">
        <p className="font-pixel text-[9px] text-text-dim">No token data available</p>
      </PixelCard>
    )
  }

  return (
    <PixelCard variant="default">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-pixel text-[10px] text-text-secondary">TOKEN USAGE TREND</h3>
        <div className="flex gap-1">
          <PixelButton
            size="sm"
            variant={range === 7 ? 'primary' : 'ghost'}
            onClick={() => setRange(7)}
          >
            7d
          </PixelButton>
          <PixelButton
            size="sm"
            variant={range === 30 ? 'primary' : 'ghost'}
            onClick={() => setRange(30)}
          >
            30d
          </PixelButton>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-6 w-12 flex flex-col justify-between text-[9px] text-text-dim font-mono">
          <span>{formatTokens(maxTotal)}</span>
          <span>{formatTokens(Math.floor(maxTotal / 2))}</span>
          <span>0</span>
        </div>

        {/* Bars */}
        <div className="ml-14 flex items-end gap-[2px] h-40">
          {data.map((d, i) => {
            const total = d.inputTokens + d.outputTokens
            const heightPct = (total / maxTotal) * 100
            const inputPct = total > 0 ? (d.inputTokens / total) * 100 : 50
            const outputPct = 100 - inputPct
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col justify-end relative cursor-pointer group"
                style={{ height: '100%' }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Tooltip */}
                {hoveredIdx === i && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-elevated border-2 border-border-dim shadow-pixel-drop px-2 py-1 z-10 whitespace-nowrap">
                    <div className="text-[9px] font-mono text-text-primary">{d.date}</div>
                    <div className="text-[8px] font-mono text-accent-blue">In: {formatTokens(d.inputTokens)}</div>
                    <div className="text-[8px] font-mono text-accent-emerald">Out: {formatTokens(d.outputTokens)}</div>
                  </div>
                )}
                {/* Stacked bar */}
                <div
                  className="w-full transition-all duration-150"
                  style={{ height: `${heightPct}%` }}
                >
                  {/* Input (top) */}
                  <div
                    className="w-full bg-accent-blue/70 hover:bg-accent-blue"
                    style={{ height: `${inputPct}%` }}
                  />
                  {/* Output (bottom) */}
                  <div
                    className="w-full bg-accent-emerald/70 hover:bg-accent-emerald"
                    style={{ height: `${outputPct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* X-axis date labels */}
        <div className="ml-14 flex gap-[2px] mt-1">
          {data.map((d, i) => {
            // Only show label for every Nth bar to avoid crowding
            const showLabel = range <= 7 || i % Math.ceil(range / 7) === 0
            return (
              <div key={d.date} className="flex-1 text-center">
                {showLabel && (
                  <span className="text-[8px] text-text-dim font-mono">
                    {d.date.slice(5)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-accent-blue/70" />
          <span className="text-[9px] text-text-dim font-mono">Input</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-accent-emerald/70" />
          <span className="text-[9px] text-text-dim font-mono">Output</span>
        </div>
      </div>
    </PixelCard>
  )
}

// --- Agent Ranking ---
function AgentRanking() {
  const agentStats = useAppStore(s => s.dashboardAgentStats)
  const navigate = useNavigate()

  const sorted = useMemo(
    () => [...agentStats].sort((a, b) => b.totalTokens - a.totalTokens),
    [agentStats],
  )

  if (sorted.length === 0) {
    return (
      <PixelCard variant="default" className="py-8 text-center">
        <p className="font-pixel text-[9px] text-text-dim">No agent data</p>
      </PixelCard>
    )
  }

  return (
    <PixelCard variant="default">
      <h3 className="font-pixel text-[10px] text-text-secondary mb-3">AGENT RANKING</h3>
      {/* Table header */}
      <div className="grid grid-cols-[2rem_1fr_5rem_5rem_4rem_4rem] gap-2 px-2 py-1 border-b-2 border-border-dim">
        <span className="text-[9px] text-text-dim font-mono">#</span>
        <span className="text-[9px] text-text-dim font-mono">Agent</span>
        <span className="text-[9px] text-text-dim font-mono text-right">Tokens</span>
        <span className="text-[9px] text-text-dim font-mono text-right">Chats</span>
        <span className="text-[9px] text-text-dim font-mono text-right">Tasks</span>
        <span className="text-[9px] text-text-dim font-mono text-right">Rate</span>
      </div>
      {/* Rows */}
      <div className="max-h-64 overflow-y-auto">
        {sorted.map((agent, idx) => {
          const taskTotal = agent.completedTasks + agent.failedTasks
          const successRate = taskTotal > 0 ? Math.round((agent.completedTasks / taskTotal) * 100) : 100
          return (
            <div
              key={agent.agentId}
              className="grid grid-cols-[2rem_1fr_5rem_5rem_4rem_4rem] gap-2 px-2 py-1.5 hover:bg-elevated/50 cursor-pointer transition-colors"
              onClick={() => navigate(`agents/${agent.agentId}`)}
            >
              <span className="text-[11px] text-text-dim font-mono">{idx + 1}</span>
              <div className="min-w-0">
                <span className="text-[11px] text-text-primary font-mono truncate block">{agent.agentName}</span>
                <span className="text-[9px] text-text-dim">{agent.model}</span>
              </div>
              <span className="text-[11px] text-accent-amber font-mono text-right">{formatTokens(agent.totalTokens)}</span>
              <span className="text-[11px] text-text-secondary font-mono text-right">{agent.conversationCount}</span>
              <span className="text-[11px] text-text-secondary font-mono text-right">
                {agent.completedTasks}/{agent.taskCount}
              </span>
              <span className={`text-[11px] font-mono text-right ${successRate >= 80 ? 'text-accent-green' : successRate >= 50 ? 'text-accent-amber' : 'text-accent-red'}`}>
                {successRate}%
              </span>
            </div>
          )
        })}
      </div>
    </PixelCard>
  )
}

// --- Recent Chats ---
function RecentChats() {
  const recentChats = useAppStore(s => s.dashboardRecentChats)
  const navigate = useNavigate()

  if (recentChats.length === 0) {
    return (
      <PixelCard variant="default" className="py-8 text-center">
        <p className="font-pixel text-[9px] text-text-dim">No recent chats</p>
      </PixelCard>
    )
  }

  return (
    <PixelCard variant="default">
      <h3 className="font-pixel text-[10px] text-text-secondary mb-3">RECENT CHATS</h3>
      <div className="flex flex-col gap-1">
        {recentChats.map(chat => (
          <div
            key={chat.conversationId}
            className="flex items-center gap-3 px-2 py-2 hover:bg-elevated/50 cursor-pointer transition-colors"
            onClick={() => navigate(`chat?conv=${chat.conversationId}`)}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-text-primary truncate">{chat.title}</div>
              <div className="text-[10px] text-text-dim">
                @{chat.agentName}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] text-text-secondary font-mono">
                {chat.messageCount} msgs &middot; {formatTokens(chat.totalTokens)}
              </div>
              <div className="text-[9px] text-text-dim font-mono">
                {relativeTime(chat.lastMessageAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PixelCard>
  )
}

// --- Main Dashboard Page ---
export function DashboardPage() {
  const { projectId } = useParams()
  const project = useCurrentProject()
  const loadDashboard = useAppStore(s => s.loadDashboard)
  const dashboardLoading = useAppStore(s => s.dashboardLoading)

  useEffect(() => {
    if (projectId) {
      loadDashboard(projectId as ProjectId)
    }
  }, [projectId, loadDashboard])

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner label="Loading dashboard..." />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1400px] mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-pixel text-[14px] text-text-primary">{project?.name ?? 'Dashboard'}</h1>
          <p className="mt-1 text-text-secondary text-[13px]">{project?.description ?? 'Project overview'}</p>
        </div>

        {/* Summary Cards */}
        <div className="mb-6">
          <SummaryCards />
        </div>

        {/* Token Trend Chart */}
        <div className="mb-6">
          <TokenTrendChart />
        </div>

        {/* Agent Ranking + Recent Chats — side by side on wide screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AgentRanking />
          <RecentChats />
        </div>
      </div>
    </div>
  )
}
