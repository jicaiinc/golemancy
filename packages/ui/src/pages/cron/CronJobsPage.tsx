import { useState } from 'react'
import { motion } from 'motion/react'
import type { CronJob, CronJobId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import {
  PixelButton, PixelCard, PixelBadge, PixelToggle,
  PixelSpinner, PixelModal,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { CronJobFormModal } from './CronJobFormModal'

export function CronJobsPage() {
  const agents = useAppStore(s => s.agents)
  const cronJobs = useAppStore(s => s.cronJobs)
  const cronJobsLoading = useAppStore(s => s.cronJobsLoading)
  const updateCronJob = useAppStore(s => s.updateCronJob)
  const deleteCronJob = useAppStore(s => s.deleteCronJob)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<CronJobId | null>(null)
  const [deletingJob, setDeletingJob] = useState<CronJob | null>(null)

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

  if (cronJobsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-pixel text-[14px] text-text-primary">Cron Jobs</h1>
          <PixelBadge variant="info">{cronJobs.length}</PixelBadge>
        </div>
        <PixelButton variant="primary" onClick={() => setShowForm(true)}>
          + New Job
        </PixelButton>
      </div>

      {/* List */}
      {cronJobs.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-12">
          <div className="font-pixel text-[20px] text-text-dim mb-4">::</div>
          <p className="font-pixel text-[10px] text-text-secondary mb-4">No scheduled jobs</p>
          <PixelButton variant="primary" onClick={() => setShowForm(true)}>
            Create First Job
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
                <PixelCard variant="interactive">
                  <div className="flex items-center gap-4">
                    {/* Toggle */}
                    <div onClick={e => e.stopPropagation()}>
                      <PixelToggle
                        checked={job.enabled}
                        onChange={() => handleToggle(job.id, job.enabled)}
                      />
                    </div>

                    {/* Name + cron expression */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-pixel text-[10px] text-text-primary truncate">
                          {job.name}
                        </span>
                        <span className="font-mono text-[11px] text-text-dim bg-deep px-2 py-0.5 border border-border-dim">
                          {job.cronExpression}
                        </span>
                      </div>
                      {job.description && (
                        <p className="text-[11px] text-text-dim mt-1 truncate">{job.description}</p>
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
                      <PixelButton size="sm" variant="ghost" onClick={() => handleEdit(job.id)}>
                        Edit
                      </PixelButton>
                      <PixelButton size="sm" variant="danger" onClick={() => setDeletingJob(job)}>
                        Delete
                      </PixelButton>
                    </div>
                  </div>
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
        title="Delete Cron Job"
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
    </div>
  )
}
