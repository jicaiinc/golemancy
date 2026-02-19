import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { CronJobId, CronJobRun } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { PixelModal, PixelCard, PixelBadge, PixelSpinner } from '../../components'

interface CronJobRunsModalProps {
  open: boolean
  onClose: () => void
  cronJobId: CronJobId | null
  cronJobName?: string
}

function formatDuration(ms?: number): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

const statusVariant: Record<CronJobRun['status'], 'success' | 'error' | 'running'> = {
  success: 'success',
  error: 'error',
  running: 'running',
}

export function CronJobRunsModal({ open, onClose, cronJobId, cronJobName }: CronJobRunsModalProps) {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const cronJobRuns = useAppStore(s => s.cronJobRuns)
  const cronJobRunsLoading = useAppStore(s => s.cronJobRunsLoading)
  const loadCronJobRuns = useAppStore(s => s.loadCronJobRuns)

  useEffect(() => {
    if (open && cronJobId) {
      loadCronJobRuns(cronJobId)
    }
  }, [open, cronJobId, loadCronJobRuns])

  function handleOpenChat(run: CronJobRun) {
    if (!projectId || !run.conversationId) return
    onClose()
    navigate(`/projects/${projectId}/chat?conv=${run.conversationId}`)
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={`Run History${cronJobName ? ` — ${cronJobName}` : ''}`}
      size="lg"
    >
      {cronJobRunsLoading ? (
        <div className="flex justify-center py-8"><PixelSpinner /></div>
      ) : cronJobRuns.length === 0 ? (
        <p className="text-[11px] text-text-dim text-center py-8">No runs yet</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
          {cronJobRuns.map(run => (
            <PixelCard key={run.id} variant="outlined" className="p-3">
              <div className="flex items-center gap-3">
                <PixelBadge variant={statusVariant[run.status]}>
                  {run.status}
                </PixelBadge>
                <PixelBadge variant="info">
                  {run.triggeredBy}
                </PixelBadge>
                <span className="text-[10px] text-text-dim font-mono">
                  {formatDuration(run.durationMs)}
                </span>
                <span className="text-[10px] text-text-dim font-mono ml-auto">
                  {formatTime(run.createdAt)}
                </span>
                {run.conversationId && (
                  <button
                    className="font-pixel text-[8px] text-accent-cyan hover:text-accent-blue transition-colors cursor-pointer"
                    onClick={() => handleOpenChat(run)}
                  >
                    OPEN CHAT &rarr;
                  </button>
                )}
              </div>
              {run.error && (
                <p className="text-[10px] text-accent-red mt-2 font-mono break-all">
                  {run.error}
                </p>
              )}
            </PixelCard>
          ))}
        </div>
      )}
    </PixelModal>
  )
}
