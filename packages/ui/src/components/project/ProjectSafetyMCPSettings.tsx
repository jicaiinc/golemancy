import { useState, useEffect, useRef } from 'react'
import type { ProjectMCPSafetyConfig, GlobalMCPSafetyConfig } from '@golemancy/shared'
import { PixelCard, PixelButton } from '../base'
import { ExecutionModeCard, type ExecutionModeOption } from '../settings/ExecutionModeCard'

interface ProjectSafetyMCPSettingsProps {
  config?: ProjectMCPSafetyConfig
  globalConfig: GlobalMCPSafetyConfig
  onSave: (config: ProjectMCPSafetyConfig) => Promise<void>
}

export function ProjectSafetyMCPSettings({
  config,
  globalConfig,
  onSave,
}: ProjectSafetyMCPSettingsProps) {
  const defaultConfig: ProjectMCPSafetyConfig = { inherit: true }
  const effectiveConfig = config ?? defaultConfig

  const [inherit, setInherit] = useState(effectiveConfig.inherit)
  const [runInSandbox, setRunInSandbox] = useState(effectiveConfig.runInSandbox ?? globalConfig.runInSandbox)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

  async function handleSave() {
    setSaving(true)
    if (inherit) {
      await onSave({ inherit: true })
    } else {
      await onSave({ inherit: false, runInSandbox })
    }
    setSaving(false)
    clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  const inheritOptions: ExecutionModeOption[] = [
    {
      id: 'inherit',
      name: 'Inherit from App Settings',
      description: 'Uses the global MCP sandbox configuration.',
      badge: { label: 'Recommended', variant: 'success' },
      children: (
        <div className="text-[11px] text-accent-green font-mono mt-1">
          Current: {globalConfig.runInSandbox ? 'Run inside sandbox' : 'Run outside sandbox'}
        </div>
      ),
    },
    {
      id: 'custom',
      name: 'Custom Configuration',
      description: 'Override MCP execution environment for this project only.',
    },
  ]

  const mcpOptions: ExecutionModeOption[] = [
    {
      id: 'inside',
      name: 'Run inside sandbox',
      description: 'MCP servers inherit sandbox restrictions. May limit MCP functionality.',
    },
    {
      id: 'outside',
      name: 'Run outside sandbox',
      description: 'MCP servers run in the main process with full access.',
      badge: { label: 'Recommended', variant: 'success' },
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Inherit vs Custom */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">MCP EXECUTION ENVIRONMENT</div>
        <ExecutionModeCard
          options={inheritOptions}
          value={inherit ? 'inherit' : 'custom'}
          onChange={id => setInherit(id === 'inherit')}
        />
      </PixelCard>

      {/* Custom MCP settings */}
      {!inherit && (
        <PixelCard>
          <div className="font-pixel text-[10px] text-text-secondary mb-3">MCP SERVER EXECUTION</div>
          <ExecutionModeCard
            options={mcpOptions}
            value={runInSandbox ? 'inside' : 'outside'}
            onChange={id => setRunInSandbox(id === 'inside')}
          />
        </PixelCard>
      )}

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
