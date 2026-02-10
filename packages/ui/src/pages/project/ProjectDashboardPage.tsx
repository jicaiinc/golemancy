import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelCard, PixelBadge, PixelButton, PixelSpinner, PixelAvatar, PixelProgress } from '../../components'
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

const statusBadge: Record<string, 'running' | 'idle' | 'error' | 'paused'> = {
  running: 'running',
  idle: 'idle',
  error: 'error',
  paused: 'paused',
}

export function ProjectDashboardPage() {
  const project = useCurrentProject()
  const agents = useAppStore(s => s.agents)
  const agentsLoading = useAppStore(s => s.agentsLoading)
  const tasks = useAppStore(s => s.tasks)
  const conversations = useAppStore(s => s.conversations)
  const navigate = useNavigate()

  if (!project) return null

  const runningAgents = agents.filter(a => a.status === 'running')
  const runningTasks = tasks.filter(t => t.status === 'running')
  const recentConversations = [...conversations]
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5)

  return (
    <motion.div className="p-6" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-pixel text-[14px] text-text-primary">{project.name}</h1>
        <p className="text-[13px] text-text-secondary mt-1">{project.description}</p>
      </div>

      {/* Stat cards */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" {...staggerItem}>
        <PixelCard>
          <div className="font-pixel text-[8px] text-text-dim mb-2">AGENTS</div>
          <div className="text-[24px] font-mono text-text-primary">{agents.length}</div>
          {runningAgents.length > 0 && (
            <PixelBadge variant="running" className="mt-2">{runningAgents.length} active</PixelBadge>
          )}
        </PixelCard>
        <PixelCard>
          <div className="font-pixel text-[8px] text-text-dim mb-2">TASKS</div>
          <div className="text-[24px] font-mono text-text-primary">{tasks.length}</div>
          {runningTasks.length > 0 && (
            <PixelBadge variant="running" className="mt-2">{runningTasks.length} running</PixelBadge>
          )}
        </PixelCard>
        <PixelCard>
          <div className="font-pixel text-[8px] text-text-dim mb-2">CONVERSATIONS</div>
          <div className="text-[24px] font-mono text-text-primary">{conversations.length}</div>
        </PixelCard>
        <PixelCard>
          <div className="font-pixel text-[8px] text-text-dim mb-2">LAST ACTIVITY</div>
          <div className="text-[13px] font-mono text-text-primary mt-1">{relativeTime(project.lastActivityAt)}</div>
        </PixelCard>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agents overview */}
        <motion.div {...staggerItem}>
          <PixelCard>
            <div className="flex items-center justify-between mb-3">
              <span className="font-pixel text-[10px] text-text-primary">Agents</span>
              <PixelButton size="sm" variant="ghost" onClick={() => navigate('agents')}>
                View all &gt;
              </PixelButton>
            </div>
            {agentsLoading ? (
              <PixelSpinner />
            ) : agents.length === 0 ? (
              <p className="text-[12px] text-text-dim py-4">No agents yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {agents.slice(0, 4).map(agent => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 p-2 hover:bg-elevated/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`agents/${agent.id}`)}
                  >
                    <PixelAvatar
                      size="sm"
                      initials={agent.name}
                      status={agent.status === 'running' ? 'online' : agent.status === 'error' ? 'error' : agent.status === 'paused' ? 'paused' : 'offline'}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-text-primary truncate">{agent.name}</div>
                      <div className="text-[11px] text-text-dim truncate">{agent.description}</div>
                    </div>
                    <PixelBadge variant={statusBadge[agent.status] ?? 'idle'}>
                      {agent.status}
                    </PixelBadge>
                  </div>
                ))}
              </div>
            )}
          </PixelCard>
        </motion.div>

        {/* Running tasks */}
        <motion.div {...staggerItem}>
          <PixelCard>
            <div className="flex items-center justify-between mb-3">
              <span className="font-pixel text-[10px] text-text-primary">Recent Tasks</span>
              <PixelButton size="sm" variant="ghost" onClick={() => navigate('tasks')}>
                View all &gt;
              </PixelButton>
            </div>
            {tasks.length === 0 ? (
              <p className="text-[12px] text-text-dim py-4">No tasks yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {tasks.slice(0, 4).map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-text-primary truncate">{task.title}</div>
                      <div className="text-[11px] text-text-dim">{task.status}</div>
                    </div>
                    {task.status === 'running' && task.progress != null && (
                      <div className="w-20">
                        <PixelProgress value={task.progress} />
                      </div>
                    )}
                    <PixelBadge variant={task.status === 'running' ? 'running' : task.status === 'completed' ? 'success' : 'idle'}>
                      {task.progress != null ? `${task.progress}%` : task.status}
                    </PixelBadge>
                  </div>
                ))}
              </div>
            )}
          </PixelCard>
        </motion.div>

        {/* Recent conversations */}
        <motion.div {...staggerItem} className="lg:col-span-2">
          <PixelCard>
            <div className="flex items-center justify-between mb-3">
              <span className="font-pixel text-[10px] text-text-primary">Recent Conversations</span>
              <PixelButton size="sm" variant="ghost" onClick={() => navigate('chat')}>
                View all &gt;
              </PixelButton>
            </div>
            {recentConversations.length === 0 ? (
              <p className="text-[12px] text-text-dim py-4">No conversations yet</p>
            ) : (
              <div className="flex flex-col gap-1">
                {recentConversations.map(conv => {
                  const agent = agents.find(a => a.id === conv.agentId)
                  return (
                    <div key={conv.id} className="flex items-center gap-3 p-2 hover:bg-elevated/50 cursor-pointer transition-colors">
                      <span className="text-[11px] text-accent-blue font-mono">
                        {agent?.name ?? '???'}
                      </span>
                      <span className="text-[12px] text-text-primary truncate flex-1">{conv.title}</span>
                      <span className="text-[11px] text-text-dim shrink-0">
                        {relativeTime(conv.lastMessageAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </PixelCard>
        </motion.div>
      </div>
    </motion.div>
  )
}
