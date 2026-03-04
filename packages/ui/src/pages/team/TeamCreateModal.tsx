import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import { PixelModal, PixelButton, PixelInput } from '../../components'

interface Props {
  open: boolean
  onClose: () => void
}

export function TeamCreateModal({ open, onClose }: Props) {
  const { t } = useTranslation('team')
  const { projectId } = useParams<{ projectId: string }>()
  const createTeam = useAppStore(s => s.createTeam)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setDescription('')
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const team = await createTeam({
        name: name.trim(),
        description: description.trim(),
        members: [],
      })
      reset()
      onClose()
      navigate(`/projects/${projectId}/teams/${team.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={t('create.modalTitle')}
      size="md"
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose}>{t('common:button.cancel')}</PixelButton>
          <PixelButton variant="primary" disabled={!name.trim() || saving} onClick={handleSubmit}>
            {saving ? t('common:button.creating') : t('create.createBtn')}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput
          label={t('create.nameLabel')}
          placeholder={t('create.namePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <PixelInput
          label={t('create.descLabel')}
          placeholder={t('create.descPlaceholder')}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
    </PixelModal>
  )
}
