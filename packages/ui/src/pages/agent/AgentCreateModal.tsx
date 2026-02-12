import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { AIProvider } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { PixelModal, PixelButton, PixelInput, PixelTextArea } from '../../components'

interface Props {
  open: boolean
  onClose: () => void
}

export function AgentCreateModal({ open, onClose }: Props) {
  const { projectId } = useParams<{ projectId: string }>()
  const createAgent = useAppStore(s => s.createAgent)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [provider, setProvider] = useState<AIProvider | undefined>(undefined)
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setDescription('')
    setSystemPrompt('')
    setProvider(undefined)
    setModel('')
  }

  async function handleSubmit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const agent = await createAgent({
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        modelConfig: { provider, model: model || undefined },
      })
      reset()
      onClose()
      navigate(`/projects/${projectId}/agents/${agent.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title="Create New Agent"
      size="md"
      footer={
        <>
          <PixelButton data-testid="cancel-btn" variant="ghost" onClick={onClose}>Cancel</PixelButton>
          <PixelButton data-testid="confirm-btn" variant="primary" disabled={!name.trim() || saving} onClick={handleSubmit}>
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
              value={provider ?? ''}
              onChange={e => setProvider(e.target.value ? e.target.value as AIProvider : undefined)}
              className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
            >
              <option value="">Inherit (from project/global)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <PixelInput
            label="MODEL"
            placeholder={
              !provider ? 'Inherit (from provider)' :
              provider === 'openai' ? 'gpt-4o' :
              provider === 'anthropic' ? 'claude-sonnet-4-5-20250929' :
              provider === 'google' ? 'gemini-2.0-flash' :
              'model-name'
            }
            value={model}
            onChange={e => setModel(e.target.value)}
          />
        </div>
      </div>
    </PixelModal>
  )
}
