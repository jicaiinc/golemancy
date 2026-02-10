import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import type { AgentStatus, TaskStatus } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import {
  PixelCard, PixelBadge, PixelSpinner, PixelTabs,
  PixelProgress, PixelAvatar, PixelButton, PixelDropdown,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const agentStatusBadge: Record<AgentStatus, 'running' | 'idle' | 'paused' | 'error'> = {
  idle: 'idle',
  running: 'running',
  paused: 'paused',
  error: 'error',
}

const taskStatusBadge: Record<TaskStatus, 'running' | 'idle' | 'success' | 'error' | 'paused'> = {
  pending: 'idle',
  running: 'running',
  completed: 'success',
  failed: 'error',
  cancelled: 'paused',
}

const activityIcons: Record<string, string> = {
  agent_started: '\u25B6',
  agent_stopped: '\u25A0',
  task_created: '+',
  task_completed: '\u2714',
  task_failed: '\u2718',
  message_sent: '\u2709',
  artifact_created: '\u2606',
}

// --- Quick Stats ---
function QuickStats() {
  const summary = useAppStore(s => s.dashboardSummary)
  if (!summary) return null

  const stats = [
    { label: 'Projects', value: summary.totalProjects, icon: '\u2302' },
    { label: 'Agents', value: summary.totalAgents, icon: '\u2699' },
    { label: 'Active', value: summary.activeAgents, icon: '\u25B6', highlight: true },
    { label: 'Running Tasks', value: summary.runningTasks, icon: '#' },
    { label: 'Done Today', value: summary.completedTasksToday, icon: '\u2714' },
    { label: 'Tokens Today', value: summary.totalTokenUsageToday.toLocaleString(), icon: '\u26A1' },
  ]

  return (
    <motion.div
      className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"
      {...staggerContainer}
      initial="initial"
      animate="animate"
    >
      {stats.map(stat => (
        <motion.div key={stat.label} {...staggerItem}>
          <PixelCard variant="default" className="text-center py-4 px-3">
            <div className="text-[16px] mb-2">{stat.icon}</div>
            <div className={`font-pixel text-[14px] ${stat.highlight ? 'text-accent-green' : 'text-text-primary'}`}>
              {stat.value}
            </div>
            <div className="text-[10px] text-text-dim mt-1">{stat.label}</div>
          </PixelCard>
        </motion.div>
      ))}
    </motion.div>
  )
}

// --- Active Agents Panel ---
function ActiveAgentsPanel() {
  const activeAgents = useAppStore(s => s.dashboardActiveAgents)
  const navigate = useNavigate()

  if (activeAgents.length === 0) {
    return (
      <PixelCard variant="outlined" className="text-center py-8">
        <div className="font-pixel text-[16px] text-text-dim mb-2">\u2699</div>
        <p className="font-pixel text-[9px] text-text-secondary">No active agents</p>
      </PixelCard>
    )
  }

  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, typeof activeAgents>()
    for (const agent of activeAgents) {
      const key = agent.projectId
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(agent)
    }
    return map
  }, [activeAgents])

  return (
    <div className="flex flex-col gap-3">
      {[...grouped.entries()].map(([projectId, agents]) => (
        <PixelCard key={projectId} variant="default">
          <div className="font-pixel text-[9px] text-text-dim mb-3">
            {agents[0].projectName}
          </div>
          <div className="flex flex-col gap-2">
            {agents.map(agent => (
              <div
                key={agent.agentId}
                className="flex items-center gap-3 px-2 py-2 bg-deep cursor-pointer hover:bg-elevated transition-colors"
                onClick={() => navigate(`/projects/${agent.projectId}/agents/${agent.agentId}`)}
              >
                <PixelAvatar
                  size="xs"
                  initials={agent.agentName}
                  status={agent.status === 'running' ? 'online' : 'offline'}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-text-primary truncate">{agent.agentName}</div>
                  {agent.currentTaskTitle && (
                    <div className="text-[10px] text-text-dim truncate">{agent.currentTaskTitle}</div>
                  )}
                </div>
                <PixelBadge variant={agentStatusBadge[agent.status]}>{agent.status}</PixelBadge>
              </div>
            ))}
          </div>
        </PixelCard>
      ))}
    </div>
  )
}

// --- Running Tasks Panel ---
function RunningTasksPanel() {
  const recentTasks = useAppStore(s => s.dashboardRecentTasks)
  const navigate = useNavigate()

  if (recentTasks.length === 0) {
    return (
      <PixelCard variant="outlined" className="text-center py-8">
        <div className="font-pixel text-[16px] text-text-dim mb-2">#</div>
        <p className="font-pixel text-[9px] text-text-secondary">No recent tasks</p>
      </PixelCard>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {recentTasks.map(task => (
        <PixelCard
          key={task.taskId}
          variant="interactive"
          onClick={() => navigate(`/projects/${task.projectId}/tasks`)}
        >
          <div className="flex items-center gap-3">
            <PixelBadge variant={taskStatusBadge[task.status]}>{task.status}</PixelBadge>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-text-primary truncate">{task.title}</div>
              <div className="text-[10px] text-text-dim">
                {task.projectName} / {task.agentName}
              </div>
            </div>
            {task.status === 'running' && (
              <div className="w-20 shrink-0">
                <PixelProgress value={task.progress} />
                <div className="text-[9px] text-text-dim text-center mt-0.5">{task.progress}%</div>
              </div>
            )}
            <span className="text-[10px] text-text-dim shrink-0">{relativeTime(task.updatedAt)}</span>
          </div>
        </PixelCard>
      ))}
    </div>
  )
}

// --- Activity Timeline ---
function ActivityTimeline() {
  const feed = useAppStore(s => s.dashboardActivityFeed)

  if (feed.length === 0) {
    return (
      <PixelCard variant="outlined" className="text-center py-8">
        <div className="font-pixel text-[16px] text-text-dim mb-2">\u2606</div>
        <p className="font-pixel text-[9px] text-text-secondary">No recent activity</p>
      </PixelCard>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {feed.map(entry => (
        <div key={entry.id} className="flex items-start gap-3 px-3 py-2 hover:bg-elevated/30 transition-colors">
          <span className="w-5 h-5 flex items-center justify-center text-[11px] text-text-dim shrink-0 mt-0.5">
            {activityIcons[entry.type] ?? '\u2022'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-text-primary">{entry.description}</div>
            <div className="text-[10px] text-text-dim">
              {entry.projectName}
              {entry.agentName && ` / ${entry.agentName}`}
            </div>
          </div>
          <span className="text-[10px] text-text-dim shrink-0">{relativeTime(entry.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}

// --- All Agents Table ---
function AllAgentsTable() {
  const projects = useAppStore(s => s.projects)
  const loadDashboardActiveAgents = useAppStore(s => s.loadDashboardActiveAgents)
  const dashboardActiveAgents = useAppStore(s => s.dashboardActiveAgents)
  const navigate = useNavigate()

  const [filterProject, setFilterProject] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // We use dashboardActiveAgents as a proxy — for a real app we'd have a full agents list
  // For now, display what we have from dashboard data
  const allAgents = dashboardActiveAgents

  const filtered = useMemo(() => {
    return allAgents.filter(a => {
      if (filterProject !== 'all' && a.projectId !== filterProject) return false
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      return true
    })
  }, [allAgents, filterProject, filterStatus])

  const projectItems = [
    { label: 'All Projects', value: 'all', selected: filterProject === 'all' },
    ...projects.map(p => ({ label: p.name, value: p.id, selected: filterProject === p.id })),
  ]

  const statusItems = [
    { label: 'All Status', value: 'all', selected: filterStatus === 'all' },
    ...(['idle', 'running', 'paused', 'error'] as AgentStatus[]).map(s => ({
      label: s, value: s, selected: filterStatus === s,
    })),
  ]

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <PixelDropdown
          trigger={
            <PixelButton size="sm" variant="ghost">
              {filterProject === 'all' ? 'All Projects' : projects.find(p => p.id === filterProject)?.name ?? 'Project'}
            </PixelButton>
          }
          items={projectItems}
          onSelect={setFilterProject}
        />
        <PixelDropdown
          trigger={
            <PixelButton size="sm" variant="ghost">
              {filterStatus === 'all' ? 'All Status' : filterStatus}
            </PixelButton>
          }
          items={statusItems}
          onSelect={setFilterStatus}
        />
      </div>

      {filtered.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-8">
          <p className="font-pixel text-[9px] text-text-secondary">No agents match filters</p>
        </PixelCard>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(agent => (
            <PixelCard
              key={agent.agentId}
              variant="interactive"
              onClick={() => navigate(`/projects/${agent.projectId}/agents/${agent.agentId}`)}
            >
              <div className="flex items-center gap-3">
                <PixelAvatar
                  size="sm"
                  initials={agent.agentName}
                  status={agent.status === 'running' ? 'online' : agent.status === 'error' ? 'error' : 'offline'}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-text-primary">{agent.agentName}</div>
                  <div className="text-[10px] text-text-dim">{agent.projectName}</div>
                </div>
                <PixelBadge variant={agentStatusBadge[agent.status]}>{agent.status}</PixelBadge>
                {agent.currentTaskTitle && (
                  <span className="text-[10px] text-text-dim truncate max-w-[200px]">
                    {agent.currentTaskTitle}
                  </span>
                )}
              </div>
            </PixelCard>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Main Dashboard Page ---
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'agents', label: 'All Agents' },
]

export function DashboardPage() {
  const navigate = useNavigate()
  const loadDashboard = useAppStore(s => s.loadDashboard)
  const dashboardLoading = useAppStore(s => s.dashboardLoading)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner label="Loading dashboard..." />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-void">
      <div className="max-w-[1400px] mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <PixelButton variant="ghost" size="sm" onClick={() => navigate('/')}>
              &larr; Projects
            </PixelButton>
            <div>
              <h1 className="font-pixel text-[16px] text-accent-green">Dashboard</h1>
              <p className="mt-1 text-text-secondary text-[13px]">Overview of all projects and agents</p>
            </div>
          </div>
          <PixelButton variant="ghost" size="sm" onClick={() => navigate('/settings')}>
            Settings
          </PixelButton>
        </div>

        {/* Quick Stats */}
        <div className="mb-6">
          <QuickStats />
        </div>

        {/* Tabs */}
        <PixelTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab content */}
        <div className="mt-6">
          {activeTab === 'overview' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column: Active Agents */}
              <div>
                <h2 className="font-pixel text-[10px] text-text-secondary mb-3">Active Agents</h2>
                <ActiveAgentsPanel />
              </div>

              {/* Center column: Running Tasks */}
              <div>
                <h2 className="font-pixel text-[10px] text-text-secondary mb-3">Recent Tasks</h2>
                <RunningTasksPanel />
              </div>

              {/* Right column: Activity Feed */}
              <div>
                <h2 className="font-pixel text-[10px] text-text-secondary mb-3">Recent Activity</h2>
                <PixelCard variant="default">
                  <ActivityTimeline />
                </PixelCard>
              </div>
            </div>
          ) : (
            <AllAgentsTable />
          )}
        </div>
      </div>
    </div>
  )
}
