import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAppStore } from '../../stores'
import { PixelModal, PixelButton, PixelInput, PixelTextArea } from '../../components'

interface Props {
  open: boolean
  onClose: () => void
  skipNavigation?: boolean
}

export function AgentCreateModal({ open, onClose, skipNavigation }: Props) {
  const { projectId } = useParams<{ projectId: string }>()
  const createAgent = useAppStore(s => s.createAgent)
  const settings = useAppStore(s => s.settings)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [providerSlug, setProviderSlug] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)

  // Available providers: test must have passed
  const availableProviders = Object.entries(settings?.providers ?? {}).filter(
    ([, entry]) => entry.testStatus === 'ok',
  )

  // Pre-select default model or first available provider when modal opens
  useEffect(() => {
    if (open && availableProviders.length > 0 && !providerSlug) {
      const dm = settings?.defaultModel
      if (dm && settings?.providers[dm.provider]) {
        setProviderSlug(dm.provider)
        setModel(dm.model)
      } else {
        const [slug, entry] = availableProviders[0]
        setProviderSlug(slug)
        setModel(entry.models[0] ?? '')
      }
    }
  }, [open, availableProviders.length, settings?.defaultModel])

  function handleProviderChange(slug: string) {
    setProviderSlug(slug)
    const entry = settings?.providers[slug]
    setModel(entry?.models[0] ?? '')
  }

  function reset() {
    setName('')
    setDescription('')
    setSystemPrompt('')
    setProviderSlug('')
    setModel('')
  }

  async function handleSubmit() {
    if (!name.trim() || !providerSlug || !model) return
    setSaving(true)
    try {
      const agent = await createAgent({
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        modelConfig: { provider: providerSlug, model },
      })
      reset()
      onClose()
      if (!skipNavigation) {
        navigate(`/projects/${projectId}/agents/${agent.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const selectedProvider = settings?.providers[providerSlug]
  const models = selectedProvider?.models ?? []

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title="Create New Agent"
      size="md"
      footer={
        <>
          <PixelButton data-testid="cancel-btn" variant="ghost" onClick={onClose}>Cancel</PixelButton>
          <PixelButton data-testid="confirm-btn" variant="primary" disabled={!name.trim() || !providerSlug || !model || saving} onClick={handleSubmit}>
            {saving ? 'Creating...' : 'Create Agent'}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput
          data-testid="agent-name-input"
          label="AGENT NAME"
          placeholder="e.g. Research Assistant"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />

        <PixelInput
          label="DESCRIPTION"
          placeholder="What does this agent do?"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />

        <PixelTextArea
          data-testid="agent-prompt-input"
          label="SYSTEM PROMPT"
          placeholder="You are a helpful assistant that..."
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          rows={4}
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">PROVIDER</label>
            <select
              value={providerSlug}
              onChange={e => handleProviderChange(e.target.value)}
              className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
            >
              {availableProviders.length === 0 && <option value="">No providers configured</option>}
              {availableProviders.map(([slug, entry]) => (
                <option key={slug} value={slug}>{entry.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">MODEL</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
            >
              {models.length === 0 && <option value="">No models available</option>}
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </PixelModal>
  )
}
