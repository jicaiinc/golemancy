import { useState, useEffect } from 'react'
import { PixelButton, PixelInput, PixelTextArea, PixelModal } from '../../components'

interface SkillFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string, description: string, instructions: string) => void | Promise<void>
  title: string
  initialName?: string
  initialDescription?: string
  initialInstructions?: string
}

export function SkillFormModal({
  open, onClose, onSubmit, title,
  initialName = '', initialDescription = '', initialInstructions = '',
}: SkillFormModalProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [instructions, setInstructions] = useState(initialInstructions)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setName(initialName)
    setDescription(initialDescription)
    setInstructions(initialInstructions)
  }, [initialName, initialDescription, initialInstructions])

  async function handleSubmit() {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(name.trim(), description.trim(), instructions.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose} disabled={submitting}>Cancel</PixelButton>
          <PixelButton variant="primary" disabled={!name.trim() || submitting} onClick={handleSubmit}>
            {submitting ? 'Saving...' : 'Save'}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput label="NAME" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <PixelInput label="DESCRIPTION" value={description} onChange={e => setDescription(e.target.value)} />
        <PixelTextArea
          label="INSTRUCTIONS"
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={10}
          placeholder="Write skill instructions in markdown..."
        />
      </div>
    </PixelModal>
  )
}
