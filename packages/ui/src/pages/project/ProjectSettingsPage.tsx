import { useState, useEffect } from 'react'
import type { AIProvider, ProjectConfig } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelButton, PixelInput, PixelTextArea, PixelCard } from '../../components'

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

export function ProjectSettingsPage() {
  const project = useCurrentProject()
  const updateProject = useAppStore(s => s.updateProject)
  const settings = useAppStore(s => s.settings)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('pickaxe')
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3)
  const [providerOverride, setProviderOverride] = useState<AIProvider | ''>('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!project) return
    setName(project.name)
    setDescription(project.description)
    setIcon(project.icon)
    setMaxConcurrentAgents(project.config.maxConcurrentAgents)
    setProviderOverride(project.config.providerOverride?.provider ?? '')
  }, [project])

  if (!project) return null

  async function handleSave() {
    if (!project) return
    setSaving(true)
    const config: ProjectConfig = {
      maxConcurrentAgents,
      ...(providerOverride ? { providerOverride: { provider: providerOverride as AIProvider } } : {}),
    }
    await updateProject(project.id, {
      name: name.trim(),
      description: description.trim(),
      icon,
      config,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 max-w-[640px]">
      <h1 className="font-pixel text-[14px] text-text-primary mb-6">Project Settings</h1>

      <div className="flex flex-col gap-6">
        {/* Basic info */}
        <PixelCard>
          <div className="font-pixel text-[10px] text-text-secondary mb-4">BASIC INFO</div>
          <div className="flex flex-col gap-4">
            <PixelInput
              label="PROJECT NAME"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <PixelTextArea
              label="DESCRIPTION"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
            <div className="flex flex-col gap-1">
              <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">ICON</label>
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

        {/* Provider config */}
        <PixelCard>
          <div className="font-pixel text-[10px] text-text-secondary mb-4">PROVIDER OVERRIDE</div>
          <p className="text-[12px] text-text-dim mb-3">
            Override the global default provider for all agents in this project.
            Leave empty to inherit from global settings ({settings?.defaultProvider ?? 'openai'}).
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">PROVIDER</label>
              <select
                value={providerOverride}
                onChange={e => setProviderOverride(e.target.value as AIProvider | '')}
                className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
              >
                <option value="">Inherit from global</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <PixelInput
              label="MAX CONCURRENT AGENTS"
              type="number"
              min={1}
              max={20}
              value={maxConcurrentAgents}
              onChange={e => setMaxConcurrentAgents(Number(e.target.value))}
            />
          </div>
        </PixelCard>

        {/* Save */}
        <div className="flex items-center gap-3">
          <PixelButton variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </PixelButton>
          {saved && <span className="text-[12px] text-accent-green">Saved!</span>}
        </div>
      </div>
    </div>
  )
}
