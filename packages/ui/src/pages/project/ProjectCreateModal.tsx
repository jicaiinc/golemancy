import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
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

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ProjectCreateModal({ open, onClose }: Props) {
  const createProject = useAppStore(s => s.createProject)
  const settings = useAppStore(s => s.settings)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('pickaxe')
  const [workDir, setWorkDir] = useState('')
  const [workDirEdited, setWorkDirEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  const basePath = settings?.defaultWorkingDirectoryBase ?? '~/projects'

  // Auto-generate working directory from project name (unless manually edited)
  useEffect(() => {
    if (!workDirEdited && name.trim()) {
      setWorkDir(`${basePath}/${slugify(name)}`)
    } else if (!workDirEdited && !name.trim()) {
      setWorkDir('')
    }
  }, [name, basePath, workDirEdited])

  function reset() {
    setName('')
    setDescription('')
    setIcon('pickaxe')
    setWorkDir('')
    setWorkDirEdited(false)
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const finalWorkDir = workDir.trim() || `${basePath}/${slugify(name)}`
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
        icon,
        workingDirectory: finalWorkDir,
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

        {/* Working directory */}
        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">
            WORKING DIRECTORY
          </label>
          <div className="flex items-center gap-2 h-9 bg-deep px-3 border-2 border-border-dim shadow-pixel-sunken">
            <span className="text-[11px] text-text-dim shrink-0">{'\u{1F4C1}'}</span>
            <input
              type="text"
              value={workDir}
              onChange={e => { setWorkDir(e.target.value); setWorkDirEdited(true) }}
              placeholder={`${basePath}/my-project`}
              className="flex-1 bg-transparent text-[12px] text-text-primary font-mono outline-none placeholder:text-text-dim"
            />
          </div>
          {!workDirEdited && name.trim() && (
            <span className="text-[9px] text-text-dim">Auto-generated from project name</span>
          )}
        </div>

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
