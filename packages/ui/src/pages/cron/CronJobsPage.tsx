import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import cronstrue from 'cronstrue'
import type { CronJob, CronJobId, CronJobRun } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import {
  PixelButton, PixelCard, PixelBadge, PixelToggle,
  PixelSpinner, PixelModal,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { CronJobFormModal } from './CronJobFormModal'
import { CronJobRunsModal } from './CronJobRunsModal'

function tryParseCron(expr: string): string {
  try {
    return cronstrue.toString(expr)
  } catch {
    return 'Invalid expression'
  }
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'overdue'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours}h`
  const days = Math.floor(hours / 24)
  return `in ${days}d`
}

function formatScheduledAt(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

const runStatusVariant: Record<CronJobRun['status'], 'success' | 'error' | 'running'> = {
  success: 'success',
  error: 'error',
  running: 'running',
}

export function CronJobsPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const agents = useAppStore(s => s.agents)
  const cronJobs = useAppStore(s => s.cronJobs)
  const cronJobsLoading = useAppStore(s => s.cronJobsLoading)
  const updateCronJob = useAppStore(s => s.updateCronJob)
  const deleteCronJob = useAppStore(s => s.deleteCronJob)
  const loadCronJobRuns = useAppStore(s => s.loadCronJobRuns)

  const triggerCronJob = useAppStore(s => s.triggerCronJob)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<CronJobId | null>(null)
  const [deletingJob, setDeletingJob] = useState<CronJob | null>(null)
  const [historyJobId, setHistoryJobId] = useState<CronJobId | null>(null)

  const editingJob = editingId ? cronJobs.find(j => j.id === editingId) : undefined

  function handleEdit(id: CronJobId) {
    setEditingId(id)
    setShowForm(true)
  }

  function handleCloseForm() {
    setShowForm(false)
    setEditingId(null)
  }

  async function handleToggle(id: CronJobId, currentEnabled: boolean) {
    await updateCronJob(id, { enabled: !currentEnabled })
  }

  async function handleConfirmDelete() {
    if (!deletingJob) return
    await deleteCronJob(deletingJob.id)
    setDeletingJob(null)
  }

  async function navigateToRunChat(job: CronJob) {
    if (!projectId || !job.lastRunId) return
    // Load latest run to get conversationId
    await loadCronJobRuns(job.id)
    const runs = useAppStore.getState().cronJobRuns
    const latestRun = runs.find(r => r.id === job.lastRunId)
    if (latestRun?.conversationId) {
      navigate(`/projects/${projectId}/chat?conv=${latestRun.conversationId}`)
    }
  }

  if (cronJobsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner />
      </div>
    )
  }

  return (
    <div className="p-6" data-testid="cron-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-pixel text-[14px] text-text-primary">Automations</h1>
          <PixelBadge variant="info">{cronJobs.length}</PixelBadge>
        </div>
        <PixelButton variant="primary" data-testid="cron-new-btn" onClick={() => setShowForm(true)}>
          + New
        </PixelButton>
      </div>

      {/* List */}
      {cronJobs.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-12">
          <div className="font-pixel text-[20px] text-text-dim mb-4">::</div>
          <p className="font-pixel text-[10px] text-text-secondary mb-4">No automations yet</p>
          <PixelButton variant="primary" onClick={() => setShowForm(true)}>
            Create First Automation
          </PixelButton>
        </PixelCard>
      ) : (
        <motion.div
          className="flex flex-col gap-3"
          {...staggerContainer}
          initial="initial"
          animate="animate"
        >
          {cronJobs.map(job => {
            const agent = agents.find(a => a.id === job.agentId)
            return (
              <motion.div key={job.id} {...staggerItem}>
                <PixelCard variant="interactive" data-testid="cron-card">
                  <div className="flex items-center gap-4">
                    {/* Toggle */}
                    <div onClick={e => e.stopPropagation()}>
                      <PixelToggle
                        data-testid="cron-toggle"
                        checked={job.enabled}
                        onChange={() => handleToggle(job.id, job.enabled)}
                      />
                    </div>

                    {/* Name + schedule info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-pixel text-[10px] text-text-primary truncate">
                          {job.name}
                        </span>
                        {job.scheduleType === 'once' ? (
                          <span className="font-mono text-[11px] text-text-dim bg-deep px-2 py-0.5 border border-border-dim">
                            once
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-text-dim bg-deep px-2 py-0.5 border border-border-dim">
                            {job.cronExpression}
                          </span>
                        )}
                        {job.lastRunStatus && job.lastRunStatus !== 'running' && (
                          <PixelBadge variant={runStatusVariant[job.lastRunStatus]}>
                            {job.lastRunStatus}
                          </PixelBadge>
                        )}
                      </div>
                      <p className="text-[10px] text-text-dim mt-0.5 font-mono">
                        {job.scheduleType === 'once'
                          ? `At ${formatScheduledAt(job.scheduledAt)}`
                          : tryParseCron(job.cronExpression)
                        }
                      </p>
                      {job.nextRunAt && job.scheduleType !== 'once' && (
                        <p className="text-[10px] text-text-dim mt-0.5 font-mono">
                          Next: {formatRelativeTime(job.nextRunAt)}
                        </p>
                      )}
                    </div>

                    {/* Agent badge */}
                    {agent ? (
                      <PixelBadge variant="info">{agent.name}</PixelBadge>
                    ) : (
                      <PixelBadge variant="error">Agent not found</PixelBadge>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <PixelButton size="sm" variant="ghost" data-testid="cron-trigger-btn" onClick={() => triggerCronJob(job.id)}>
                        Run
                      </PixelButton>
                      <PixelButton size="sm" variant="ghost" data-testid="cron-history-btn" onClick={() => setHistoryJobId(job.id)}>
                        History
                      </PixelButton>
                      <PixelButton size="sm" variant="ghost" onClick={() => handleEdit(job.id)}>
                        Edit
                      </PixelButton>
                      <PixelButton size="sm" variant="ghost" onClick={() => setDeletingJob(job)}>
                        Delete
                      </PixelButton>
                    </div>
                  </div>

                  {/* Running status bar */}
                  {job.lastRunStatus === 'running' && (
                    <div className="mt-2 flex items-center gap-2 bg-accent-green/10 border-2 border-accent-green/30 px-3 py-1.5">
                      <span className="w-2 h-2 bg-accent-green animate-pulse" />
                      <span className="text-[10px] text-accent-green font-mono">Running...</span>
                      {job.lastRunId && (
                        <button
                          onClick={() => navigateToRunChat(job)}
                          className="ml-auto text-[10px] text-accent-green font-mono cursor-pointer hover:underline"
                        >
                          View Chat →
                        </button>
                      )}
                    </div>
                  )}
                </PixelCard>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Form modal */}
      <CronJobFormModal
        open={showForm}
        onClose={handleCloseForm}
        editJob={editingJob}
      />

      {/* Delete confirmation */}
      <PixelModal
        open={!!deletingJob}
        onClose={() => setDeletingJob(null)}
        title="Delete Automation"
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" onClick={() => setDeletingJob(null)}>Cancel</PixelButton>
            <PixelButton variant="danger" onClick={handleConfirmDelete}>Delete</PixelButton>
          </>
        }
      >
        <p className="text-[12px] text-text-secondary">
          Are you sure you want to delete &quot;{deletingJob?.name}&quot;? This action cannot be undone.
        </p>
      </PixelModal>

      {/* Run history modal */}
      <CronJobRunsModal
        open={!!historyJobId}
        onClose={() => setHistoryJobId(null)}
        cronJobId={historyJobId}
        cronJobName={historyJobId ? cronJobs.find(j => j.id === historyJobId)?.name : undefined}
      />
    </div>
  )
}
