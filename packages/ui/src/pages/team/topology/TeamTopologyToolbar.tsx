import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Team } from '@golemancy/shared'
import { PixelButton } from '../../../components'
import { useAppStore } from '../../../stores'

interface TeamTopologyToolbarProps {
  team: Team
  onResetLayout: () => void
  onToggleAgents: () => void
  onToggleSettings: () => void
}

export function TeamTopologyToolbar({
  team, onResetLayout, onToggleAgents, onToggleSettings,
}: TeamTopologyToolbarProps) {
  const { t } = useTranslation('team')
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const updateTeam = useAppStore(s => s.updateTeam)
  const deleteTeam = useAppStore(s => s.deleteTeam)

  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(team.name)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(team.name)
  }, [team.name])

  async function saveName() {
    setEditingName(false)
    if (name.trim() && name !== team.name) {
      await updateTeam(team.id, { name: name.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function handleDelete() {
    await deleteTeam(team.id)
    navigate(`/projects/${projectId}/teams`)
  }

  return (
    <div className="bg-surface/90 border-b-2 border-border-dim px-4 py-2 flex items-center gap-3 shrink-0 backdrop-blur-sm z-10">
      <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/teams`)}>
        {t('detail.backBtn')}
      </PixelButton>

      <div className="w-px h-6 bg-border-dim" />

      {/* Team name (click-to-edit) */}
      {editingName ? (
        <input
          autoFocus
          className="font-pixel text-[12px] text-text-primary bg-deep px-2 h-7 border-2 border-accent-blue outline-none min-w-[120px] max-w-[240px]"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      ) : (
        <button onClick={() => setEditingName(true)} className="font-pixel text-[12px] text-text-primary hover:text-accent-blue cursor-pointer truncate max-w-[240px]">
          {team.name}
        </button>
      )}

      {saved && <span className="text-accent-green text-[11px] font-pixel shrink-0">{t('detail.savedMsg')}</span>}

      <div className="flex-1" />

      {/* Agents */}
      <PixelButton variant="ghost" size="sm" onClick={onToggleAgents}>
        {t('topology.sidebar.agents')}
      </PixelButton>

      {/* Settings */}
      <PixelButton variant="ghost" size="sm" onClick={onToggleSettings}>
        {t('topology.settingsBtn')}
      </PixelButton>

      {/* Reset Layout */}
      <PixelButton variant="ghost" size="sm" onClick={onResetLayout}>
        {t('topology.resetLayout')}
      </PixelButton>

      {/* Delete Team */}
      {showDeleteConfirm ? (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-accent-red">{t('topology.deleteTeamConfirm')}</span>
          <PixelButton variant="danger" size="sm" onClick={handleDelete}>
            {t('common:button.confirm')}
          </PixelButton>
          <PixelButton variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
            {t('common:button.cancel')}
          </PixelButton>
        </div>
      ) : (
        <PixelButton variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
          {t('topology.deleteTeam')}
        </PixelButton>
      )}
    </div>
  )
}
