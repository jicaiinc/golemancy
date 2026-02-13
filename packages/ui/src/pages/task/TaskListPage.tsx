import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { TaskStatus } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import {
  PixelCard, PixelBadge, PixelButton, PixelSpinner,
  PixelAvatar, PixelProgress, PixelDropdown,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { TaskLogViewer } from './TaskLogViewer'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const statusBadgeVariant: Record<TaskStatus, 'running' | 'idle' | 'success' | 'error' | 'paused'> = {
  pending: 'idle',
  running: 'running',
  completed: 'success',
  failed: 'error',
  cancelled: 'paused',
}

const ALL_STATUSES: TaskStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled']

export function TaskListPage() {
  const project = useCurrentProject()
  const tasks = useAppStore(s => s.tasks)
  const tasksLoading = useAppStore(s => s.tasksLoading)
  const agents = useAppStore(s => s.agents)
  const cancelTask = useAppStore(s => s.cancelTask)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterAgent, setFilterAgent] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterAgent !== 'all' && t.agentId !== filterAgent) return false
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      return true
    })
  }, [tasks, filterAgent, filterStatus])

  if (!project) return null

  const agentItems = [
    { label: 'All Agents', value: 'all', selected: filterAgent === 'all' },
    ...agents.map(a => ({ label: a.name, value: a.id, selected: filterAgent === a.id })),
  ]

  const statusItems = [
    { label: 'All Status', value: 'all', selected: filterStatus === 'all' },
    ...ALL_STATUSES.map(s => ({ label: s, value: s, selected: filterStatus === s })),
  ]

  return (
    <motion.div className="p-6" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">Task Monitor</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} total
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PixelDropdown
            trigger={
              <PixelButton size="sm" variant="ghost">
                {filterAgent === 'all' ? 'All Agents' : agents.find(a => a.id === filterAgent)?.name ?? 'Agent'}
              </PixelButton>
            }
            items={agentItems}
            onSelect={setFilterAgent}
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
      </div>

      {/* Task list */}
      {tasksLoading ? (
        <div className="flex justify-center py-12">
          <PixelSpinner label="Loading tasks..." />
        </div>
      ) : filteredTasks.length === 0 ? (
        <motion.div {...staggerItem}>
          <PixelCard variant="outlined">
            <div className="text-center py-8">
              <div className="font-pixel text-[20px] text-text-dim mb-4">#</div>
              <p className="font-pixel text-[10px] text-text-secondary">No tasks found</p>
            </div>
          </PixelCard>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTasks.map(task => {
            const agent = agents.find(a => a.id === task.agentId)
            const isExpanded = expandedId === task.id

            return (
              <motion.div key={task.id} {...staggerItem}>
                <PixelCard
                  variant="interactive"
                  onClick={() => setExpandedId(isExpanded ? null : task.id)}
                >
                  <div className="flex items-center gap-4">
                    {/* Status badge */}
                    <PixelBadge variant={statusBadgeVariant[task.status]}>
                      {task.status}
                    </PixelBadge>

                    {/* Title + description */}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-text-primary font-mono">{task.title}</div>
                      <div className="text-[11px] text-text-dim truncate">{task.description}</div>
                    </div>

                    {/* Agent */}
                    {agent && (
                      <div className="flex items-center gap-2 shrink-0">
                        <PixelAvatar size="xs" initials={agent.name} status={agent.status === 'running' ? 'online' : 'offline'} />
                        <span className="text-[11px] text-text-secondary">{agent.name}</span>
                      </div>
                    )}

                    {/* Progress (running only) */}
                    {task.status === 'running' && (
                      <div className="w-24 shrink-0">
                        <PixelProgress value={task.progress} />
                        <div className="text-[10px] text-text-dim text-center mt-1">{task.progress}%</div>
                      </div>
                    )}

                    {/* Token usage */}
                    <div className="text-[11px] text-text-dim font-mono shrink-0">
                      {task.tokenUsage.toLocaleString()} tok
                    </div>

                    {/* Timestamp */}
                    <span className="text-[11px] text-text-dim shrink-0">
                      {relativeTime(task.updatedAt)}
                    </span>

                    {/* Expand indicator */}
                    <span className="text-[10px] text-text-dim">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  </div>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t-2 border-border-dim">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-pixel text-[8px] text-text-dim">EXECUTION LOG</span>
                            {(task.status === 'running' || task.status === 'pending') && (
                              <PixelButton
                                size="sm"
                                variant="danger"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  cancelTask(task.id)
                                }}
                              >
                                Cancel Task
                              </PixelButton>
                            )}
                          </div>
                          <TaskLogViewer log={task.log} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </PixelCard>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
