import { useState, useEffect } from 'react'
import type { MCPTransportType, MCPServerConfig } from '@solocraft/shared'
import { PixelButton, PixelInput, PixelTextArea, PixelModal } from '../../components'

interface MCPFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    name: string
    transportType: MCPTransportType
    description: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
    url?: string
    headers?: Record<string, string>
  }) => void | Promise<void>
  title: string
  initial?: MCPServerConfig
}

export function MCPFormModal({ open, onClose, onSubmit, title, initial }: MCPFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [transportType, setTransportType] = useState<MCPTransportType>(initial?.transportType ?? 'stdio')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [command, setCommand] = useState(initial?.command ?? '')
  const [args, setArgs] = useState(initial?.args?.join(' ') ?? '')
  const [envText, setEnvText] = useState(
    initial?.env ? Object.entries(initial.env).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  )
  const [cwd, setCwd] = useState(initial?.cwd ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [headersText, setHeadersText] = useState(
    initial?.headers ? Object.entries(initial.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : ''
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setName(initial?.name ?? '')
    setTransportType(initial?.transportType ?? 'stdio')
    setDescription(initial?.description ?? '')
    setCommand(initial?.command ?? '')
    setArgs(initial?.args?.join(' ') ?? '')
    setEnvText(initial?.env ? Object.entries(initial.env).map(([k, v]) => `${k}=${v}`).join('\n') : '')
    setCwd(initial?.cwd ?? '')
    setUrl(initial?.url ?? '')
    setHeadersText(initial?.headers ? Object.entries(initial.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '')
  }, [initial, open])

  function parseEnv(text: string): Record<string, string> | undefined {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length === 0) return undefined
    const result: Record<string, string> = {}
    for (const line of lines) {
      const idx = line.indexOf('=')
      if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    return result
  }

  function parseHeaders(text: string): Record<string, string> | undefined {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length === 0) return undefined
    const result: Record<string, string> = {}
    for (const line of lines) {
      const idx = line.indexOf(':')
      if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    return result
  }

  async function handleSubmit() {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        transportType,
        description: description.trim(),
        ...(transportType === 'stdio' ? {
          command: command.trim() || undefined,
          args: args.trim() ? args.trim().split(/\s+/) : undefined,
          env: parseEnv(envText),
          cwd: cwd.trim() || undefined,
        } : {
          url: url.trim() || undefined,
          headers: parseHeaders(headersText),
        }),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const isEdit = !!initial

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
        <PixelInput label="NAME" value={name} onChange={e => setName(e.target.value)} autoFocus disabled={isEdit} />
        <PixelInput label="DESCRIPTION" value={description} onChange={e => setDescription(e.target.value)} />

        {/* Transport selector */}
        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">TRANSPORT</label>
          <div className="flex gap-2">
            {(['stdio', 'sse', 'http'] as MCPTransportType[]).map(t => (
              <button
                key={t}
                onClick={() => setTransportType(t)}
                className={`px-3 py-1.5 font-mono text-[12px] border-2 cursor-pointer transition-colors ${
                  transportType === t
                    ? 'bg-accent-green/20 border-accent-green text-accent-green'
                    : 'bg-deep border-border-dim text-text-secondary hover:border-text-dim'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Conditional fields */}
        {transportType === 'stdio' ? (
          <>
            <PixelInput label="COMMAND" value={command} onChange={e => setCommand(e.target.value)} placeholder="npx" />
            <PixelInput label="ARGS (space-separated)" value={args} onChange={e => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /tmp" />
            <PixelTextArea label="ENV (KEY=VALUE per line)" value={envText} onChange={e => setEnvText(e.target.value)} rows={3} placeholder="GITHUB_TOKEN=ghp_..." />
            <PixelInput label="CWD" value={cwd} onChange={e => setCwd(e.target.value)} placeholder="/path/to/dir" />
          </>
        ) : (
          <>
            <PixelInput label="URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:3100/sse" />
            <PixelTextArea label="HEADERS (Key: Value per line)" value={headersText} onChange={e => setHeadersText(e.target.value)} rows={3} placeholder="Authorization: Bearer ..." />
          </>
        )}
      </div>
    </PixelModal>
  )
}
