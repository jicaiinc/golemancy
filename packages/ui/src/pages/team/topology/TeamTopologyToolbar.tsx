import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Team } from '@golemancy/shared'
import { PixelButton } from '../../../components'
import { useAppStore } from '../../../stores'

interface TeamTopologyToolbarProps {
  team: Team
  onResetLayout: () => void
}

export function TeamTopologyToolbar({ team, onResetLayout }: TeamTopologyToolbarProps) {
  const { t } = useTranslation('team')
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const updateTeam = useAppStore(s => s.updateTeam)
  const deleteTeam = useAppStore(s => s.deleteTeam)

  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(team.name)
  const [editingDesc, setEditingDesc] = useState(false)
  const [description, setDescription] = useState(team.description)
  const [showInstruction, setShowInstruction] = useState(false)
  const [instruction, setInstruction] = useState(team.instruction ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(team.name)
    setDescription(team.description)
    setInstruction(team.instruction ?? '')
  }, [team.name, team.description, team.instruction])

  async function saveName() {
    setEditingName(false)
    if (name.trim() && name !== team.name) {
      await updateTeam(team.id, { name: name.trim() })
      flashSaved()
    }
  }

  async function saveDesc() {
    setEditingDesc(false)
    if (description !== team.description) {
      await updateTeam(team.id, { description: description.trim() })
      flashSaved()
    }
  }

  async function saveInstruction() {
    const val = instruction.trim() || undefined
    if (val !== (team.instruction ?? undefined)) {
      await updateTeam(team.id, { instruction: val })
      flashSaved()
    }
  }

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDelete() {
    await deleteTeam(team.id)
    navigate(`/projects/${projectId}/teams`)
  }

  return (
    <div className="absolute top-0 left-0 right-0 z-40 bg-surface/90 border-b-2 border-border-dim px-4 py-2 flex items-center gap-3 backdrop-blur-sm">
      {/* Back */}
      <PixelButton variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/teams`)}>
        {t('detail.backBtn')}
      </PixelButton>

      <div className="w-px h-6 bg-border-dim" />

      {/* Team name (click-to-edit) */}
      {editingName ? (
        <input
          autoFocus
          className="font-pixel text-[12px] text-text-primary bg-deep px-2 h-7 border-2 border-accent-blue outline-none min-w-[120px]"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      ) : (
        <button onClick={() => setEditingName(true)} className="font-pixel text-[12px] text-text-primary hover:text-accent-blue cursor-pointer truncate max-w-[200px]">
          {team.name}
        </button>
      )}

      {/* Team description (click-to-edit) */}
      {editingDesc ? (
        <input
          autoFocus
          className="font-mono text-[11px] text-text-secondary bg-deep px-2 h-7 border-2 border-accent-blue outline-none flex-1 min-w-[100px] max-w-[300px]"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={saveDesc}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      ) : (
        <button onClick={() => setEditingDesc(true)} className="font-mono text-[11px] text-text-dim hover:text-text-secondary cursor-pointer truncate max-w-[250px]">
          {team.description || '(no description)'}
        </button>
      )}

      {saved && <span className="text-accent-green text-[11px] font-pixel shrink-0">{t('detail.savedMsg')}</span>}

      <div className="flex-1" />

      {/* Instruction toggle */}
      <PixelButton variant="ghost" size="sm" onClick={() => setShowInstruction(!showInstruction)}>
        {t('topology.instruction')}
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

      {/* Instruction panel (collapsible below toolbar) */}
      {showInstruction && (
        <div className="absolute top-full left-0 right-0 bg-surface border-b-2 border-border-dim px-4 py-3 z-30">
          <div className="font-pixel text-[8px] text-text-dim mb-1">{t('topology.instruction')}</div>
          <textarea
            className="w-full h-24 bg-deep px-3 py-2 font-mono text-[12px] text-text-primary border-2 border-border-dim outline-none focus:border-accent-blue resize-none"
            placeholder={t('topology.instructionPlaceholder')}
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onBlur={saveInstruction}
          />
        </div>
      )}
    </div>
  )
}
