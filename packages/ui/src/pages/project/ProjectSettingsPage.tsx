import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useTabParam } from '../../hooks'
import { useTranslation } from 'react-i18next'
import type { Agent, AgentId, ProjectId, Team, TeamId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { encodeTeamValue, decodeSelectValue } from '../../lib/team-select'
import { PixelButton, PixelInput, PixelTextArea, PixelCard, PixelTabs, PermissionsSettings } from '../../components'
import { CheckIcon, CopyIcon } from '../../components/base/PixelIcons'

const ICONS = [
  { id: 'pickaxe', label: '\u26CF' },
  { id: 'sword', label: '\u2694' },
  { id: 'shield', label: '\uD83D\uDEE1' },
  { id: 'book', label: '\uD83D\uDCD6' },
  { id: 'star', label: '\u2B50' },
  { id: 'gem', label: '\uD83D\uDC8E' },
  { id: 'flame', label: '\uD83D\uDD25' },
  { id: 'bolt', label: '\u26A1' },
]

export function ProjectSettingsPage() {
  const { t } = useTranslation('project')
  const { projectId } = useParams<{ projectId: string }>()
  const project = useCurrentProject()
  const updateProject = useAppStore(s => s.updateProject)
  const deleteProject = useAppStore(s => s.deleteProject)
  const agents = useAppStore(s => s.agents)
  const teams = useAppStore(s => s.teams)
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useTabParam(['general', 'permissions'])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('pickaxe')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const settingsTabs = useMemo(() => [
    { id: 'general', label: t('settings.tabs.general') },
    { id: 'permissions', label: t('settings.tabs.permissions') },
  ], [t])

  useEffect(() => {
    if (!project) return
    setName(project.name)
    setDescription(project.description)
    setIcon(project.icon)
  }, [project])

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

  if (!project) return null

  async function handleDefaultChange(value: string) {
    if (!project) return
    const parsed = decodeSelectValue(value)
    if (!parsed) {
      await updateProject(project.id, { defaultTargetType: undefined, defaultTargetId: undefined })
    } else {
      await updateProject(project.id, { defaultTargetType: parsed.targetType, defaultTargetId: parsed.targetId })
    }
  }

  async function handleSave() {
    if (!project) return
    setSaving(true)
    await updateProject(project.id, {
      name: name.trim(),
      description: description.trim(),
      icon,
    })
    setSaving(false)
    clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className={`p-6 ${activeTab === 'permissions' ? 'max-w-[960px]' : 'max-w-[640px]'}`}>
      <h1 className="font-pixel text-[14px] text-text-primary mb-6">{t('settings.title')}</h1>

      <PixelTabs tabs={settingsTabs} activeTab={activeTab} onTabChange={setActiveTab} testIdPrefix="project-settings" />

      <div className="mt-4">
        {activeTab === 'general' && (
          <GeneralTab
            project={project}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            icon={icon}
            setIcon={setIcon}
            saving={saving}
            saved={saved}
            onSave={handleSave}
            onDelete={async () => { await deleteProject(project.id); navigate('/') }}
            agents={agents}
            teams={teams}
            onDefaultChange={handleDefaultChange}
          />
        )}
        {activeTab === 'permissions' && (
          <PermissionsSettings projectId={projectId! as ProjectId} />
        )}
      </div>
    </div>
  )
}

// ========== General Tab ==========
function GeneralTab({
  project,
  name,
  setName,
  description,
  setDescription,
  icon,
  setIcon,
  saving,
  saved,
  onSave,
  onDelete,
  agents,
  teams,
  onDefaultChange,
}: {
  project: NonNullable<ReturnType<typeof useCurrentProject>>
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  icon: string
  setIcon: (v: string) => void
  saving: boolean
  saved: boolean
  onSave: () => void
  onDelete: () => Promise<void>
  agents: Agent[]
  teams: Team[]
  onDefaultChange: (value: string) => void
}) {
  const { t } = useTranslation('project')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">{t('settings.general.sectionTitle')}</div>
        <div className="flex flex-col gap-4">
          <CopyableId label={t('label.projectId')} value={project.id} />
          <PixelInput
            label={t('label.projectName')}
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <PixelTextArea
            label={t('label.description')}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
          />
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('label.icon')}</label>
            <div className="flex gap-2">
              {ICONS.map(ic => (
                <button
                  key={ic.id}
                  onClick={() => setIcon(ic.id)}
                  className={`w-10 h-10 flex items-center justify-center text-[18px] border-2 cursor-pointer transition-colors ${
                    icon === ic.id
                      ? 'bg-accent-green/15 border-accent-green'
                      : 'bg-deep border-border-dim hover:border-border-bright'
                  }`}
                >
                  {ic.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PixelCard>

      {/* Default Agent / Team */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-2">{t('settings.general.defaultLabel')}</div>
        <p className="text-[12px] text-text-dim mb-3">{t('settings.general.defaultDesc')}</p>
        <select
          value={project.defaultTargetType === 'team' ? encodeTeamValue(project.defaultTargetId as TeamId) : project.defaultTargetId ?? ''}
          onChange={e => onDefaultChange(e.target.value)}
          className="w-full h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-sunken outline-none focus:border-accent-blue cursor-pointer"
        >
          <option value="">{t('settings.general.defaultNone')}</option>
          {teams.length > 0 && (
            <optgroup label={t('settings.general.defaultTeamsGroup')}>
              {teams.map(tm => (
                <option key={tm.id} value={encodeTeamValue(tm.id)}>{tm.name}</option>
              ))}
            </optgroup>
          )}
          <optgroup label={t('settings.general.defaultAgentsGroup')}>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </optgroup>
        </select>
      </PixelCard>

      <div className="flex items-center gap-3">
        <PixelButton variant="primary" data-testid="save-btn" onClick={onSave} disabled={saving || !name.trim()}>
          {saving ? t('common:button.saving') : t('settings.general.saveBtn')}
        </PixelButton>
        {saved && <span className="text-[12px] text-accent-green">{t('settings.savedMsg')}</span>}
        <div className="ml-auto">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-accent-red">{t('settings.general.deleteConfirm')}</span>
              <PixelButton variant="danger" size="sm" onClick={onDelete}>{t('common:button.confirm')}</PixelButton>
              <PixelButton variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>{t('common:button.cancel')}</PixelButton>
            </div>
          ) : (
            <PixelButton variant="danger" onClick={() => setShowDeleteConfirm(true)}>{t('settings.general.deleteBtn')}</PixelButton>
          )}
        </div>
      </div>
    </div>
  )
}

// ========== Copyable ID Display ==========
function CopyableId({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation('project')
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    clearTimeout(timerRef.current)
    setCopied(true)
    timerRef.current = setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <div className="flex flex-col gap-1">
      <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{label}</label>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCopy}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCopy() }}
        title={t('settings.clickToCopy')}
        className="group flex items-center gap-2 w-fit px-2 py-1 bg-deep border border-border-dim cursor-pointer select-all hover:border-border-bright transition-colors"
      >
        <span className="font-mono text-[11px] text-text-dim">{value}</span>
        <span className="text-text-dim/50 group-hover:text-text-dim transition-colors">
          {copied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
        </span>
      </div>
    </div>
  )
}
