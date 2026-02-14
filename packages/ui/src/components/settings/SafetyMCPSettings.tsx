import { useState, useEffect, useRef } from 'react'
import type { GlobalMCPSafetyConfig } from '@golemancy/shared'
import { PixelCard, PixelButton } from '../base'
import { ExecutionModeCard, type ExecutionModeOption } from './ExecutionModeCard'

interface SafetyMCPSettingsProps {
  config: GlobalMCPSafetyConfig
  onSave: (config: GlobalMCPSafetyConfig) => Promise<void>
}

const DEFAULT_CONFIG: GlobalMCPSafetyConfig = {
  runInSandbox: false,
}

export function SafetyMCPSettings({ config, onSave }: SafetyMCPSettingsProps) {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config }

  const [runInSandbox, setRunInSandbox] = useState(effectiveConfig.runInSandbox)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

  async function handleSave() {
    setSaving(true)
    await onSave({ runInSandbox })
    setSaving(false)
    clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  const mcpOptions: ExecutionModeOption[] = [
    {
      id: 'inside',
      name: 'Run inside sandbox',
      description: 'MCP servers inherit sandbox restrictions. May limit MCP functionality (e.g., filesystem MCP cannot access files outside sandbox).',
    },
    {
      id: 'outside',
      name: 'Run outside sandbox',
      description: 'MCP servers run in the main process with full access. Security is controlled by MCP\'s own configuration.',
      badge: { label: 'Recommended', variant: 'success' },
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* MCP Execution Mode */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">MCP SERVER EXECUTION</div>
        <ExecutionModeCard
          options={mcpOptions}
          value={runInSandbox ? 'inside' : 'outside'}
          onChange={id => setRunInSandbox(id === 'inside')}
        />
      </PixelCard>

      {/* Info box */}
      <div className="bg-accent-blue/5 border-2 border-accent-blue/20 p-4">
        <div className="font-pixel text-[10px] text-accent-blue mb-2">
          {'\u2139'} WHY RUN OUTSIDE SANDBOX?
        </div>
        <p className="text-[11px] text-text-dim leading-relaxed">
          MCP servers are user-installed trusted code that provide additional capabilities
          (filesystem, database, network). Running them inside sandbox defeats their purpose.
          Their security is controlled by MCP's own allowed paths and configuration.
        </p>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-2">
        <PixelButton variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </PixelButton>
        {saved && <span className="text-[11px] text-accent-green">Saved!</span>}
      </div>
    </div>
  )
}
