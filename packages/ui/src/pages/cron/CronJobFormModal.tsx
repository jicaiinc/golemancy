import { useState, useEffect } from 'react'
import type { AgentId, CronJob } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { PixelModal, PixelInput, PixelTextArea, PixelButton, PixelToggle } from '../../components'

const PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily 9am', value: '0 9 * * *' },
  { label: 'Weekly Mon', value: '0 9 * * 1' },
]

interface CronJobFormModalProps {
  open: boolean
  onClose: () => void
  editJob?: CronJob
}

export function CronJobFormModal({ open, onClose, editJob }: CronJobFormModalProps) {
  const agents = useAppStore(s => s.agents)
  const createCronJob = useAppStore(s => s.createCronJob)
  const updateCronJob = useAppStore(s => s.updateCronJob)

  const [name, setName] = useState('')
  const [cronExpression, setCronExpression] = useState('0 * * * *')
  const [agentId, setAgentId] = useState<AgentId | ''>('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  const isEdit = !!editJob

  useEffect(() => {
    if (editJob) {
      setName(editJob.name)
      setCronExpression(editJob.cronExpression)
      setAgentId(editJob.agentId)
      setDescription(editJob.description)
      setEnabled(editJob.enabled)
    } else {
      setName('')
      setCronExpression('0 * * * *')
      setAgentId(agents.length > 0 ? agents[0].id : '')
      setDescription('')
      setEnabled(true)
    }
  }, [editJob, open, agents])

  async function handleSubmit() {
    if (!name.trim() || !cronExpression.trim() || !agentId) return
    setSaving(true)
    try {
      if (isEdit && editJob) {
        await updateCronJob(editJob.id, {
          name: name.trim(),
          cronExpression: cronExpression.trim(),
          agentId: agentId as AgentId,
          description: description.trim(),
          enabled,
        })
      } else {
        await createCronJob({
          name: name.trim(),
          cronExpression: cronExpression.trim(),
          agentId: agentId as AgentId,
          description: description.trim(),
          enabled,
        })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Cron Job' : 'New Cron Job'}
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose}>Cancel</PixelButton>
          <PixelButton
            variant="primary"
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !cronExpression.trim() || !agentId}
          >
            {saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput
          label="NAME"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Daily code review"
        />

        <div className="flex flex-col gap-1">
          <PixelInput
            label="CRON EXPRESSION"
            value={cronExpression}
            onChange={e => setCronExpression(e.target.value)}
            placeholder="0 * * * *"
          />
          <span className="text-[10px] text-text-dim font-mono">minute hour day month weekday</span>
          <div className="flex gap-2 mt-1">
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setCronExpression(p.value)}
                className={`px-2 py-1 text-[10px] font-mono border-2 cursor-pointer transition-colors ${
                  cronExpression === p.value
                    ? 'bg-accent-green/15 border-accent-green text-accent-green'
                    : 'bg-deep border-border-dim text-text-secondary hover:border-border-bright'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">AGENT</label>
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value as AgentId)}
            className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
          >
            <option value="">Select an agent</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <PixelTextArea
          label="DESCRIPTION (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          placeholder="What does this job do?"
        />

        <PixelToggle checked={enabled} onChange={setEnabled} label="Enabled" />
      </div>
    </PixelModal>
  )
}
