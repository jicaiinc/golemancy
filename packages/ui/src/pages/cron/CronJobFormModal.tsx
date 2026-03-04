import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import cronstrue from 'cronstrue'
import type { AgentId, CronJob, TeamId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { PixelModal, PixelInput, PixelTextArea, PixelButton, PixelToggle } from '../../components'
import { encodeTeamValue, decodeSelectValue } from '../../lib/team-select'

function tryParseCron(expr: string, invalidLabel: string): string {
  try {
    return cronstrue.toString(expr)
  } catch {
    return invalidLabel
  }
}

/** Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm) in local timezone */
function isoToLocalDatetime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert datetime-local format (YYYY-MM-DDTHH:mm) to ISO string. Interprets as local time. */
function localDatetimeToIso(local: string): string {
  if (!local) return ''
  const d = new Date(local)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

interface CronJobFormModalProps {
  open: boolean
  onClose: () => void
  editJob?: CronJob
}

export function CronJobFormModal({ open, onClose, editJob }: CronJobFormModalProps) {
  const { t } = useTranslation(['cron', 'common'])
  const agents = useAppStore(s => s.agents)
  const teams = useAppStore(s => s.teams)
  const createCronJob = useAppStore(s => s.createCronJob)
  const updateCronJob = useAppStore(s => s.updateCronJob)

  const [name, setName] = useState('')
  const [cronExpression, setCronExpression] = useState('0 * * * *')
  const [agentId, setAgentId] = useState<AgentId | ''>('')
  const [teamId, setTeamId] = useState<TeamId | ''>('')
  const [instruction, setInstruction] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [scheduleType, setScheduleType] = useState<'cron' | 'once'>('cron')
  const [scheduledAtLocal, setScheduledAtLocal] = useState('') // datetime-local format: YYYY-MM-DDTHH:mm
  const [saving, setSaving] = useState(false)

  // Combined select value: agent or team (mutually exclusive, like Chat)
  const selectValue = teamId ? encodeTeamValue(teamId) : (agentId as string)

  const isEdit = !!editJob

  const presets = [
    { label: t('cron:form.presets.every5min'), value: '*/5 * * * *' },
    { label: t('cron:form.presets.everyHour'), value: '0 * * * *' },
    { label: t('cron:form.presets.every12h'), value: '0 */12 * * *' },
    { label: t('cron:form.presets.daily9am'), value: '0 9 * * *' },
    { label: t('cron:form.presets.weeklyMon'), value: '0 9 * * 1' },
  ]

  useEffect(() => {
    if (editJob) {
      setName(editJob.name)
      setCronExpression(editJob.cronExpression)
      setAgentId(editJob.agentId)
      setTeamId(editJob.teamId ?? '')
      setInstruction(editJob.instruction ?? '')
      setEnabled(editJob.enabled)
      setScheduleType(editJob.scheduleType ?? 'cron')
      setScheduledAtLocal(editJob.scheduledAt ? isoToLocalDatetime(editJob.scheduledAt) : '')
    } else {
      setName('')
      setCronExpression('0 * * * *')
      setAgentId(agents.length > 0 ? agents[0].id : '')
      setTeamId('')
      setInstruction('')
      setEnabled(true)
      setScheduleType('cron')
      setScheduledAtLocal('')
    }
  }, [editJob, open, agents])

  const isValid = scheduleType === 'cron'
    ? !!(name.trim() && cronExpression.trim() && agentId)
    : !!(name.trim() && scheduledAtLocal && agentId)

  async function handleSubmit() {
    if (!isValid) return
    setSaving(true)
    try {
      const scheduledAtIso = scheduleType === 'once' ? localDatetimeToIso(scheduledAtLocal) : undefined
      const resolvedTeamId = teamId || undefined
      if (isEdit && editJob) {
        await updateCronJob(editJob.id, {
          name: name.trim(),
          cronExpression: cronExpression.trim(),
          agentId: agentId as AgentId,
          teamId: resolvedTeamId as TeamId | undefined,
          instruction: instruction.trim() || undefined,
          enabled,
          scheduleType,
          scheduledAt: scheduledAtIso,
        })
      } else {
        await createCronJob({
          name: name.trim(),
          cronExpression: scheduleType === 'cron' ? cronExpression.trim() : '',
          agentId: agentId as AgentId,
          teamId: resolvedTeamId as TeamId | undefined,
          instruction: instruction.trim() || undefined,
          enabled,
          scheduleType,
          scheduledAt: scheduledAtIso,
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
      title={isEdit ? t('cron:form.editTitle') : t('cron:form.newTitle')}
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose}>{t('common:button.cancel')}</PixelButton>
          <PixelButton
            variant="primary"
            onClick={handleSubmit}
            disabled={saving || !isValid}
          >
            {saving ? t('common:button.saving') : isEdit ? t('common:button.save') : t('common:button.create')}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput
          label={t('cron:form.nameLabel')}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('cron:form.namePlaceholder')}
        />

        {/* Schedule Type Toggle */}
        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('cron:form.typeLabel')}</label>
          <div className="flex gap-2">
            <button
              onClick={() => setScheduleType('cron')}
              className={`flex-1 px-3 py-2 text-[10px] font-pixel border-2 cursor-pointer transition-colors ${
                scheduleType === 'cron'
                  ? 'bg-accent-blue/15 border-accent-blue text-accent-blue'
                  : 'bg-deep border-border-dim text-text-secondary hover:border-border-bright'
              }`}
            >
              {t('cron:form.recurring')}
            </button>
            <button
              onClick={() => setScheduleType('once')}
              className={`flex-1 px-3 py-2 text-[10px] font-pixel border-2 cursor-pointer transition-colors ${
                scheduleType === 'once'
                  ? 'bg-accent-blue/15 border-accent-blue text-accent-blue'
                  : 'bg-deep border-border-dim text-text-secondary hover:border-border-bright'
              }`}
            >
              {t('cron:form.oneTime')}
            </button>
          </div>
        </div>

        {scheduleType === 'cron' ? (
          <div className="flex flex-col gap-1">
            <PixelInput
              label={t('cron:form.cronLabel')}
              value={cronExpression}
              onChange={e => setCronExpression(e.target.value)}
              placeholder="0 * * * *"
            />
            <span className="text-[10px] text-text-dim font-mono">minute hour day month weekday</span>
            <span className={`text-[10px] font-mono ${tryParseCron(cronExpression, t('cron:form.invalidExpression')) !== t('cron:form.invalidExpression') ? 'text-accent-green' : 'text-accent-red'}`}>
              {tryParseCron(cronExpression, t('cron:form.invalidExpression'))}
            </span>
            <div className="flex gap-2 mt-1">
              {presets.map(p => (
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
        ) : (
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('cron:form.scheduledAtLabel')}</label>
            <input
              type="datetime-local"
              value={scheduledAtLocal}
              onChange={e => setScheduledAtLocal(e.target.value)}
              className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue dark:[color-scheme:dark]"
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('cron:form.agentLabel')}</label>
          <select
            value={selectValue}
            onChange={e => {
              const parsed = decodeSelectValue(e.target.value)
              if (!parsed) {
                setAgentId('')
                setTeamId('')
              } else if ('teamId' in parsed) {
                setTeamId(parsed.teamId)
                // Auto-set agent to team leader
                const team = teams.find(tm => tm.id === parsed.teamId)
                const leader = team?.members.find(m => !m.parentAgentId)
                if (leader) setAgentId(leader.agentId)
              } else {
                setAgentId(parsed.agentId)
                setTeamId('')
              }
            }}
            className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
          >
            <option value="">{t('cron:form.agentPlaceholder')}</option>
            {teams.length > 0 ? (
              <>
                <optgroup label={t('cron:form.teamsGroup')}>
                  {teams.map(tm => (
                    <option key={tm.id} value={encodeTeamValue(tm.id)}>{tm.name}</option>
                  ))}
                </optgroup>
                <optgroup label={t('cron:form.agentsGroup')}>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>@{a.name}</option>
                  ))}
                </optgroup>
              </>
            ) : (
              agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))
            )}
          </select>
        </div>

        <PixelTextArea
          label={t('cron:form.instructionLabel')}
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          rows={3}
          placeholder={t('cron:form.instructionPlaceholder')}
        />

        <PixelToggle checked={enabled} onChange={setEnabled} label={t('cron:form.enabledLabel')} />
      </div>
    </PixelModal>
  )
}
