import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import { PixelModal, PixelButton, PixelInput, PixelTextArea } from '../../components'

const ICONS = [
  { id: 'pickaxe', label: '\u26CF' },
  { id: 'sword', label: '\u2694' },
  { id: 'shield', label: '\u{1F6E1}' },
  { id: 'book', label: '\u{1F4D6}' },
  { id: 'star', label: '\u2B50' },
  { id: 'gem', label: '\u{1F48E}' },
  { id: 'flame', label: '\u{1F525}' },
  { id: 'bolt', label: '\u26A1' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export function ProjectCreateModal({ open, onClose }: Props) {
  const { t } = useTranslation('project')
  const createProject = useAppStore(s => s.createProject)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('pickaxe')
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setDescription('')
    setIcon('pickaxe')
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
        icon,
      })
      reset()
      onClose()
      navigate(`/projects/${project.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={t('create.modalTitle')}
      size="sm"
      footer={
        <>
          <PixelButton data-testid="cancel-btn" variant="ghost" onClick={onClose}>{t('common:button.cancel')}</PixelButton>
          <PixelButton data-testid="confirm-btn" variant="primary" disabled={!name.trim() || saving} onClick={handleSubmit}>
            {saving ? t('common:button.creating') : t('create.createBtn')}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput
          data-testid="project-name-input"
          label={t('label.projectName')}
          placeholder={t('create.namePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <PixelTextArea
          data-testid="project-desc-input"
          label={t('label.description')}
          placeholder={t('create.descPlaceholder')}
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />

        {/* Icon picker */}
        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">
            {t('label.icon')}
          </label>
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
    </PixelModal>
  )
}
