import { useState, useEffect, useRef } from 'react'
import type { BashExecutionMode, SandboxPreset, SandboxConfig, GlobalBashToolConfig } from '@golemancy/shared'
import { PRESET_BALANCED, getPresetConfig } from '@golemancy/shared'
import { PixelCard, PixelButton, PixelModal, PixelToggle } from '../base'
import { ExecutionModeCard, type ExecutionModeOption } from './ExecutionModeCard'
import { BashPresetSelector } from './BashPresetSelector'
import { PathListEditor } from './PathListEditor'

interface SafetyBashToolSettingsProps {
  config: GlobalBashToolConfig
  onSave: (config: GlobalBashToolConfig) => Promise<void>
}

const DEFAULT_CONFIG: GlobalBashToolConfig = {
  defaultMode: 'sandbox',
  sandboxPreset: 'balanced',
}

export function SafetyBashToolSettings({ config, onSave }: SafetyBashToolSettingsProps) {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config }

  const [mode, setMode] = useState<BashExecutionMode>(effectiveConfig.defaultMode)
  const [preset, setPreset] = useState<SandboxPreset>(effectiveConfig.sandboxPreset)
  const [customConfig, setCustomConfig] = useState<SandboxConfig>(
    effectiveConfig.customConfig
      ? getPresetConfig('custom', effectiveConfig.customConfig)
      : PRESET_BALANCED
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [showUnrestrictedModal, setShowUnrestrictedModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

  // Auto-expand advanced config when Custom preset is selected
  useEffect(() => {
    if (preset === 'custom') setAdvancedOpen(true)
  }, [preset])

  function handleModeChange(newMode: string) {
    if (newMode === 'unrestricted') {
      setShowUnrestrictedModal(true)
      return
    }
    setMode(newMode as BashExecutionMode)
  }

  function confirmUnrestricted() {
    setMode('unrestricted')
    setShowUnrestrictedModal(false)
  }

  function handlePresetChange(newPreset: SandboxPreset) {
    setPreset(newPreset)
    if (newPreset !== 'custom') {
      // Reset custom config to the selected preset's values for display
      setCustomConfig(getPresetConfig(newPreset))
    }
  }

  function updateCustomConfig(partial: Partial<SandboxConfig>) {
    setCustomConfig(prev => ({ ...prev, ...partial }))
    if (preset !== 'custom') setPreset('custom')
  }

  function updateFilesystem(partial: Partial<SandboxConfig['filesystem']>) {
    setCustomConfig(prev => ({
      ...prev,
      filesystem: { ...prev.filesystem, ...partial },
    }))
    if (preset !== 'custom') setPreset('custom')
  }

  function updateNetwork(partial: Partial<SandboxConfig['network']>) {
    setCustomConfig(prev => ({
      ...prev,
      network: { ...prev.network, ...partial },
    }))
    if (preset !== 'custom') setPreset('custom')
  }

  async function handleSave() {
    setSaving(true)
    const result: GlobalBashToolConfig = {
      defaultMode: mode,
      sandboxPreset: preset,
    }
    if (preset === 'custom') {
      result.customConfig = customConfig
    }
    await onSave(result)
    setSaving(false)
    clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  // The config to display in Advanced Configuration
  const displayConfig = preset === 'custom' ? customConfig : getPresetConfig(preset)
  const isCustom = preset === 'custom'

  const modeOptions: ExecutionModeOption[] = [
    {
      id: 'restricted',
      name: 'Restricted',
      subtitle: '"Do Not Touch My Computer"',
      description: 'Virtual filesystem, 70+ built-in commands. No real system commands (git, npm, docker).',
      badge: { label: 'Safe', variant: 'info' },
    },
    {
      id: 'sandbox',
      name: 'Sandbox',
      subtitle: 'OS-level isolation with real command execution',
      description: 'Powered by Anthropic Sandbox Runtime. Real commands run inside an isolated environment.',
      badge: { label: 'Recommended', variant: 'success' },
    },
    {
      id: 'unrestricted',
      name: 'Unrestricted',
      subtitle: 'No sandbox protection. Full system access.',
      description: 'For local development and trusted environments only.',
      badge: { label: 'Danger', variant: 'error' },
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Execution Mode */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">EXECUTION MODE</div>
        <ExecutionModeCard
          options={modeOptions}
          value={mode}
          onChange={handleModeChange}
        />
      </PixelCard>

      {/* Preset Selector (only when sandbox mode) */}
      {mode === 'sandbox' && (
        <PixelCard>
          <div className="font-pixel text-[10px] text-text-secondary mb-3">SANDBOX PRESET</div>
          <BashPresetSelector value={preset} onChange={handlePresetChange} />
        </PixelCard>
      )}

      {/* Advanced Configuration (only when sandbox mode) */}
      {mode === 'sandbox' && (
        <PixelCard>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            aria-expanded={advancedOpen}
            aria-controls="advanced-config"
            className="flex items-center gap-2 font-pixel text-[10px] text-text-secondary cursor-pointer hover:text-text-primary transition-colors w-full text-left"
          >
            <span className="transition-transform" style={{ transform: advancedOpen ? 'rotate(90deg)' : undefined }}>
              &#9654;
            </span>
            ADVANCED CONFIGURATION
            {!isCustom && (
              <span className="text-[9px] text-text-dim font-mono ml-2">(read-only)</span>
            )}
          </button>

          {advancedOpen && (
              <div
                id="advanced-config"
                role="region"
                className="mt-4 flex flex-col gap-5"
              >
                {/* Filesystem Permissions */}
                <div>
                  <div className="font-pixel text-[9px] text-text-dim mb-3">FILE SYSTEM PERMISSIONS</div>
                  <div className="flex flex-col gap-4">
                    <PathListEditor
                      label="ALLOW WRITE"
                      items={displayConfig.filesystem.allowWrite}
                      onChange={items => updateFilesystem({ allowWrite: items })}
                      placeholder="Enter path or glob pattern..."
                      readOnly={!isCustom}
                    />
                    <PathListEditor
                      label="DENY READ"
                      items={displayConfig.filesystem.denyRead}
                      onChange={items => updateFilesystem({ denyRead: items })}
                      placeholder="Enter path or glob pattern..."
                      readOnly={!isCustom}
                    />
                    <PathListEditor
                      label="DENY WRITE"
                      items={displayConfig.filesystem.denyWrite}
                      onChange={items => updateFilesystem({ denyWrite: items })}
                      placeholder="Enter path or glob pattern..."
                      readOnly={!isCustom}
                    />
                  </div>
                </div>

                {/* Network Permissions */}
                <div>
                  <div className="font-pixel text-[9px] text-text-dim mb-3">NETWORK PERMISSIONS</div>
                  <PathListEditor
                    label="ALLOWED DOMAINS"
                    items={displayConfig.network.allowedDomains}
                    onChange={items => updateNetwork({ allowedDomains: items })}
                    placeholder="Enter domain (e.g., *.github.com)..."
                    readOnly={!isCustom}
                  />
                </div>

                {/* Other options */}
                <div>
                  <div className="font-pixel text-[9px] text-text-dim mb-3">OTHER</div>
                  <div className="flex flex-col gap-3">
                    <PixelToggle
                      checked={displayConfig.enablePython}
                      onChange={checked => isCustom && updateCustomConfig({ enablePython: checked })}
                      disabled={!isCustom}
                      label="Enable Python"
                    />
                    <PixelToggle
                      checked={displayConfig.filesystem.allowGitConfig}
                      onChange={checked => isCustom && updateFilesystem({ allowGitConfig: checked })}
                      disabled={!isCustom}
                      label="Allow Git Config"
                    />
                  </div>
                </div>

                {/* Denied Commands */}
                <PathListEditor
                  label="DENIED COMMANDS"
                  items={displayConfig.deniedCommands}
                  onChange={items => updateCustomConfig({ deniedCommands: items })}
                  placeholder="Enter command pattern (e.g., sudo *)..."
                  readOnly={!isCustom}
                />
              </div>
            )}
        </PixelCard>
      )}

      {/* Save button */}
      <div className="flex items-center gap-2">
        <PixelButton variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </PixelButton>
        {saved && <span className="text-[11px] text-accent-green">Saved!</span>}
      </div>

      {/* Unrestricted Confirmation Modal */}
      <PixelModal
        open={showUnrestrictedModal}
        onClose={() => setShowUnrestrictedModal(false)}
        title="Enable Unrestricted Mode?"
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setShowUnrestrictedModal(false)}>
              Cancel
            </PixelButton>
            <PixelButton variant="danger" size="sm" onClick={confirmUnrestricted}>
              I Understand, Enable
            </PixelButton>
          </>
        }
      >
        <div className="text-[12px] text-text-secondary leading-relaxed">
          <p className="mb-3">
            This removes all sandbox protection. AI agents will have full access to your system, including:
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-dim mb-3">
            <li>Read/write any file on your computer</li>
            <li>Execute any system command</li>
            <li>Access network without restrictions</li>
            <li>Modify system configuration</li>
          </ul>
          <p className="text-text-dim">
            Only use this for local development in trusted environments.
          </p>
        </div>
      </PixelModal>
    </div>
  )
}
