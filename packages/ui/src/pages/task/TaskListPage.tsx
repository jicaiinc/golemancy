import { useMemo, useEffect, useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import type { ConversationTaskStatus } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import {
  PixelCard, PixelBadge, PixelSpinner,
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

const statusIcon: Record<ConversationTaskStatus, string> = {
  pending: '\u2610',
  in_progress: '\u25B6',
  completed: '\u2611',
  deleted: '\u2612',
}

const statusBadgeVariant: Record<ConversationTaskStatus, 'idle' | 'running' | 'success' | 'error'> = {
  pending: 'idle',
  in_progress: 'running',
  completed: 'success',
  deleted: 'error',
}


export function TaskListPage() {
  const project = useCurrentProject()
  const tasks = useAppStore(s => s.conversationTasks)
  const tasksLoading = useAppStore(s => s.tasksLoading)
  const conversations = useAppStore(s => s.conversations)
  const refreshConversationTasks = useAppStore(s => s.refreshConversationTasks)
  const navigate = useNavigate()

  // Refresh tasks on mount to ensure we have the latest data
  useEffect(() => {
    refreshConversationTasks()
  }, [refreshConversationTasks])

  // Expanded conversation groups (collapsed by default)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // Expanded individual task detail
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const toggleGroup = useCallback((convId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(convId)) {
        next.delete(convId)
      } else {
        next.add(convId)
      }
      return next
    })
  }, [])

  // Group by conversation
  const grouped = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of tasks) {
      const group = map.get(t.conversationId) ?? []
      group.push(t)
      map.set(t.conversationId, group)
    }
    return map
  }, [tasks])

  if (!project) return null

  return (
    <motion.div className="p-6" data-testid="task-list-page" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary" data-testid="task-list-header">Agent Tasks</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} total
          </p>
        </div>
      </div>

      {/* Task list */}
      {tasksLoading ? (
        <div className="flex justify-center py-12">
          <PixelSpinner label="Loading tasks..." />
        </div>
      ) : tasks.length === 0 ? (
        <motion.div {...staggerItem}>
          <PixelCard variant="outlined">
            <div className="text-center py-8" data-testid="task-empty-state">
              <div className="font-pixel text-[20px] text-text-dim mb-4">#</div>
              <p className="font-pixel text-[10px] text-text-secondary">No tasks found</p>
            </div>
          </PixelCard>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...grouped.entries()].map(([convId, convTasks]) => {
            const conv = conversations.find(c => c.id === convId)
            const isGroupExpanded = expandedGroups.has(convId)
            const completedCount = convTasks.filter(t => t.status === 'completed').length
            const totalCount = convTasks.filter(t => t.status !== 'deleted').length

            return (
              <motion.div key={convId} {...staggerItem}>
                {/* Conversation group header — clickable to expand/collapse */}
                <PixelCard variant="interactive" onClick={() => toggleGroup(convId)}>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-text-dim font-mono">
                      {isGroupExpanded ? '\u25BC' : '\u25B6'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-pixel text-[10px] text-text-primary">
                        {conv?.title ?? convId}
                      </span>
                    </div>
                    <PixelBadge variant={completedCount === totalCount ? 'success' : 'idle'}>
                      {completedCount}/{totalCount}
                    </PixelBadge>
                    {/* Link to conversation */}
                    <button
                      className="font-pixel text-[8px] text-accent-cyan hover:text-accent-blue transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/projects/${project.id}/chat?conv=${convId}`)
                      }}
                    >
                      OPEN CHAT &rarr;
                    </button>
                  </div>
                </PixelCard>

                {/* Tasks in this conversation — collapsed by default */}
                <AnimatePresence>
                  {isGroupExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-2 mt-2 ml-4 border-l-2 border-border-dim pl-3">
                        {convTasks.map(task => {
                          const isTaskExpanded = expandedTaskId === task.id
                          return (
                            <PixelCard
                              key={task.id}
                              variant="interactive"
                              data-testid={`task-card-${task.id}`}
                              onClick={() => setExpandedTaskId(isTaskExpanded ? null : task.id)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-[14px] font-mono">{statusIcon[task.status]}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13px] text-text-primary font-mono">{task.subject}</div>
                                  {task.activeForm && task.status === 'in_progress' && (
                                    <div className="text-[11px] text-accent-amber">{task.activeForm}</div>
                                  )}
                                </div>
                                <PixelBadge variant={statusBadgeVariant[task.status]}>
                                  {task.status.replace('_', ' ')}
                                </PixelBadge>
                                {task.owner && (
                                  <span className="text-[11px] text-text-dim font-mono">{task.owner}</span>
                                )}
                                <span className="text-[11px] text-text-dim shrink-0">
                                  {relativeTime(task.updatedAt)}
                                </span>
                                <span className="text-[10px] text-text-dim">{isTaskExpanded ? '\u25BC' : '\u25B6'}</span>
                              </div>

                              <AnimatePresence>
                                {isTaskExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-3 pt-3 border-t-2 border-border-dim space-y-2">
                                      {task.description && (
                                        <div>
                                          <span className="font-pixel text-[8px] text-text-dim">DESCRIPTION</span>
                                          <p className="text-[12px] text-text-secondary font-mono mt-1">{task.description}</p>
                                        </div>
                                      )}
                                      {task.blockedBy.length > 0 && (
                                        <div>
                                          <span className="font-pixel text-[8px] text-text-dim">BLOCKED BY</span>
                                          <div className="flex gap-1 mt-1">
                                            {task.blockedBy.map(bid => (
                                              <PixelBadge key={bid} variant="error">{bid}</PixelBadge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {task.metadata && Object.keys(task.metadata).length > 0 && (
                                        <div>
                                          <span className="font-pixel text-[8px] text-text-dim">METADATA</span>
                                          <pre className="text-[10px] font-mono text-text-dim bg-void p-2 mt-1 overflow-x-auto">
                                            {JSON.stringify(task.metadata, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </PixelCard>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
