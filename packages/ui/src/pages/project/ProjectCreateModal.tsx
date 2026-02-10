import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppStore } from '../../stores'
import { PixelModal, PixelButton, PixelInput, PixelTextArea } from '../../components'

const ICONS = [
  { id: 'pickaxe', label: '⛏' },
  { id: 'sword', label: '⚔' },
  { id: 'shield', label: '🛡' },
  { id: 'book', label: '📖' },
  { id: 'star', label: '⭐' },
  { id: 'gem', label: '💎' },
  { id: 'flame', label: '🔥' },
  { id: 'bolt', label: '⚡' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export function ProjectCreateModal({ open, onClose }: Props) {
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
      const project = await createProject({ name: name.trim(), description: description.trim(), icon })
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
      title="Create New Project"
      size="sm"
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose}>Cancel</PixelButton>
          <PixelButton variant="primary" disabled={!name.trim() || saving} onClick={handleSubmit}>
            {saving ? 'Creating...' : 'Create Project'}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput
          label="PROJECT NAME"
          placeholder="My Awesome Project"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <PixelTextArea
          label="DESCRIPTION"
          placeholder="What is this project about?"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />

        {/* Icon picker */}
        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">
            ICON
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
