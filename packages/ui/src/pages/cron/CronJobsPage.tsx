import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import cronstrue from 'cronstrue'
import type { CronJob, CronJobId, CronJobRun, ProjectId } from '@golemancy/shared'
import { useAgents } from '../../queries/agents'
import { useTeams } from '../../queries/teams'
import { useCronJobs, useUpdateCronJob, useDeleteCronJob, useTriggerCronJob } from '../../queries/cron-jobs'
import { getServices } from '../../services'
import { queryClient } from '../../queries/query-client'
import { queryKeys } from '../../queries/keys'
import {
  PixelButton, PixelCard, PixelBadge, PixelToggle,
  PixelSpinner, PixelModal,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { CronJobFormModal } from './CronJobFormModal'
import { CronJobRunsModal } from './CronJobRunsModal'

function tryParseCron(expr: string, invalidLabel: string): string {
  try {
    return cronstrue.toString(expr)
  } catch {
    return invalidLabel
  }
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
  const { t } = useTranslation('cron')
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { data: agents = [] } = useAgents(projectId as ProjectId | null)
  const { data: teams = [] } = useTeams(projectId as ProjectId | null)
  const { data: cronJobs = [], isLoading: cronJobsLoading } = useCronJobs(projectId as ProjectId | null)
  const updateCronJobMutation = useUpdateCronJob()
  const deleteCronJobMutation = useDeleteCronJob()
  const triggerCronJobMutation = useTriggerCronJob()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<CronJobId | null>(null)
  const [deletingJob, setDeletingJob] = useState<CronJob | null>(null)
  const [historyJobId, setHistoryJobId] = useState<CronJobId | null>(null)

  const editingJob = editingId ? cronJobs.find(j => j.id === editingId) : undefined

  function formatRelativeTime(iso?: string): string {
    if (!iso) return '—'
    const diff = new Date(iso).getTime() - Date.now()
    if (diff < 0) return t('job.overdue')
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return t('common:time.inMins', { count: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('common:time.inHours', { count: hours })
    const days = Math.floor(hours / 24)
    return t('common:time.inDays', { count: days })
  }

  function handleEdit(id: CronJobId) {
    setEditingId(id)
    setShowForm(true)
  }

  function handleCloseForm() {
    setShowForm(false)
    setEditingId(null)
  }

  async function handleToggle(id: CronJobId, currentEnabled: boolean) {
    await updateCronJobMutation.mutateAsync({ id, data: { enabled: !currentEnabled } })
  }

  async function handleConfirmDelete() {
    if (!deletingJob) return
    await deleteCronJobMutation.mutateAsync(deletingJob.id)
    setDeletingJob(null)
  }

  const navigateToRunChat = useCallback(async (job: CronJob) => {
    if (!projectId || !job.lastRunId) return
    const svc = getServices().cronJobs
    if (!svc.listRuns) return
    const runs = await queryClient.fetchQuery({
      queryKey: queryKeys.cronJobRuns.all(projectId as ProjectId, job.id),
      queryFn: () => svc.listRuns!(projectId as ProjectId, job.id),
    })
    const latestRun = runs.find(r => r.id === job.lastRunId)
    if (latestRun?.conversationId) {
      navigate(`/projects/${projectId}/chat?conv=${latestRun.conversationId}`)
    }
  }, [projectId, navigate])

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
          <h1 className="font-pixel text-[14px] text-text-primary">{t('page.title')}</h1>
          <PixelBadge variant="info">{cronJobs.length}</PixelBadge>
        </div>
        <PixelButton variant="primary" data-testid="cron-new-btn" onClick={() => setShowForm(true)}>
          {t('page.newBtn')}
        </PixelButton>
      </div>

      {/* List */}
      {cronJobs.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-12">
          <div className="font-arcade text-[20px] text-text-dim mb-4">::</div>
          <p className="font-pixel text-[10px] text-text-secondary mb-4">{t('empty.noJobs')}</p>
          <PixelButton variant="primary" onClick={() => setShowForm(true)}>
            {t('empty.createFirstBtn')}
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
            const agent = job.targetType === 'agent' ? agents.find(a => a.id === job.targetId) : undefined
            const team = job.targetType === 'team' ? teams.find(tm => tm.id === job.targetId) : undefined
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
                      <div className="flex items-start gap-2">
                        <span className="font-pixel text-[10px] text-text-primary line-clamp-2 flex-1 min-w-0" title={job.name}>
                          {job.name}
                        </span>
                        {job.scheduleType === 'once' ? (
                          <span className="font-mono text-[11px] text-text-dim bg-deep px-2 py-0.5 border border-border-dim">
                            {t('job.once')}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-text-dim bg-deep px-2 py-0.5 border border-border-dim">
                            {job.cronExpression}
                          </span>
                        )}
                        {job.lastRunStatus && job.lastRunStatus !== 'running' && (
                          <PixelBadge variant={runStatusVariant[job.lastRunStatus]}>
                            {t(`status.${job.lastRunStatus}`)}
                          </PixelBadge>
                        )}
                      </div>
                      <p className="text-[10px] text-text-dim mt-0.5 font-mono">
                        {job.scheduleType === 'once'
                          ? t('job.at', { time: formatScheduledAt(job.scheduledAt) })
                          : tryParseCron(job.cronExpression, t('form.invalidExpression'))
                        }
                      </p>
                      {job.nextRunAt && job.scheduleType !== 'once' && (
                        <p className="text-[10px] text-text-dim mt-0.5 font-mono">
                          {t('job.next', { time: formatRelativeTime(job.nextRunAt) })}
                        </p>
                      )}
                    </div>

                    {/* Agent/Team badge */}
                    {team ? (
                      <PixelBadge variant="info">{team.name}</PixelBadge>
                    ) : agent ? (
                      <PixelBadge variant="info">@{agent.name}</PixelBadge>
                    ) : (
                      <PixelBadge variant="error">{t('job.agentNotFound')}</PixelBadge>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <PixelButton size="sm" variant="ghost" data-testid="cron-trigger-btn" onClick={() => triggerCronJobMutation.mutate(job.id)}>
                        {t('job.runBtn')}
                      </PixelButton>
                      <PixelButton size="sm" variant="ghost" data-testid="cron-history-btn" onClick={() => setHistoryJobId(job.id)}>
                        {t('job.historyBtn')}
                      </PixelButton>
                      <PixelButton size="sm" variant="ghost" onClick={() => handleEdit(job.id)}>
                        {t('common:button.edit')}
                      </PixelButton>
                      <PixelButton size="sm" variant="ghost" onClick={() => setDeletingJob(job)}>
                        {t('common:button.delete')}
                      </PixelButton>
                    </div>
                  </div>

                  {/* Running status bar */}
                  {job.lastRunStatus === 'running' && (
                    <div className="mt-2 flex items-center gap-2 bg-accent-green/10 border-2 border-accent-green/30 px-3 py-1.5">
                      <span className="w-2 h-2 bg-accent-green animate-pulse" />
                      <span className="text-[10px] text-accent-green font-mono">{t('job.runningStatus')}</span>
                      {job.lastRunId && (
                        <button
                          onClick={() => navigateToRunChat(job)}
                          className="ml-auto text-[10px] text-accent-green font-mono cursor-pointer hover:underline"
                        >
                          {t('job.viewChat')}
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
        title={t('delete.title')}
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" onClick={() => setDeletingJob(null)}>{t('common:button.cancel')}</PixelButton>
            <PixelButton variant="danger" onClick={handleConfirmDelete}>{t('common:button.delete')}</PixelButton>
          </>
        }
      >
        <p className="text-[12px] text-text-secondary">
          {t('delete.confirm', { name: deletingJob?.name })}
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
