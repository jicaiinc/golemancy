import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type {
  BashExecutionMode,
  SandboxPreset,
  SandboxConfig,
  ProjectBashToolConfig,
  GlobalBashToolConfig,
} from '@golemancy/shared'
import { PRESET_BALANCED, getPresetConfig } from '@golemancy/shared'
import { PixelCard, PixelButton, PixelModal, PixelToggle } from '../base'
import { ExecutionModeCard, type ExecutionModeOption } from '../settings/ExecutionModeCard'
import { BashPresetSelector } from '../settings/BashPresetSelector'
import { PathListEditor } from '../settings/PathListEditor'
import { fadeInUp } from '../../lib/motion'

interface ProjectSafetyBashToolSettingsProps {
  config?: ProjectBashToolConfig
  globalConfig: GlobalBashToolConfig
  onSave: (config: ProjectBashToolConfig) => Promise<void>
}

function getGlobalModeSummary(globalConfig: GlobalBashToolConfig): string {
  if (globalConfig.defaultMode === 'restricted') return 'Restricted'
  if (globalConfig.defaultMode === 'unrestricted') return 'Unrestricted'
  const preset = globalConfig.sandboxPreset ?? 'balanced'
  return `Sandbox (${preset.charAt(0).toUpperCase() + preset.slice(1)})`
}

export function ProjectSafetyBashToolSettings({
  config,
  globalConfig,
  onSave,
}: ProjectSafetyBashToolSettingsProps) {
  const defaultConfig: ProjectBashToolConfig = { inherit: true }
  const effectiveConfig = config ?? defaultConfig

  const [inherit, setInherit] = useState(effectiveConfig.inherit)
  const [mode, setMode] = useState<BashExecutionMode>(effectiveConfig.mode ?? globalConfig.defaultMode)
  const [preset, setPreset] = useState<SandboxPreset>(globalConfig.sandboxPreset)
  const [customConfig, setCustomConfig] = useState<SandboxConfig>(
    effectiveConfig.customConfig
      ? getPresetConfig('custom', effectiveConfig.customConfig)
      : getPresetConfig(globalConfig.sandboxPreset, globalConfig.customConfig)
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [showUnrestrictedModal, setShowUnrestrictedModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

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
    if (inherit) {
      await onSave({ inherit: true })
    } else {
      const result: ProjectBashToolConfig = {
        inherit: false,
        mode,
      }
      if (mode === 'sandbox' && preset === 'custom') {
        result.customConfig = customConfig
      }
      await onSave(result)
    }
    setSaving(false)
    clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  // Resolved global config for preview
  const globalEffectiveConfig = getPresetConfig(globalConfig.sandboxPreset, globalConfig.customConfig)
  const displayConfig = preset === 'custom' ? customConfig : getPresetConfig(preset)
  const isCustomPreset = preset === 'custom'

  const inheritOptions: ExecutionModeOption[] = [
    {
      id: 'inherit',
      name: 'Inherit from App Settings',
      description: 'Uses the global sandbox configuration.',
      badge: { label: 'Recommended', variant: 'success' },
      children: (
        <div className="text-[11px] text-accent-green font-mono mt-1">
          Current: {getGlobalModeSummary(globalConfig)}
        </div>
      ),
    },
    {
      id: 'custom',
      name: 'Custom Configuration',
      description: 'Create a project-specific sandbox configuration.',
    },
  ]

  const modeOptions: ExecutionModeOption[] = [
    {
      id: 'restricted',
      name: 'Restricted',
      subtitle: '"Do Not Touch My Computer"',
      description: 'Virtual filesystem, 70+ built-in commands. No real system commands.',
      badge: { label: 'Safe', variant: 'info' },
    },
    {
      id: 'sandbox',
      name: 'Sandbox',
      subtitle: 'OS-level isolation with real command execution',
      description: 'Powered by Anthropic Sandbox Runtime.',
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
      {/* Inherit vs Custom */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">EXECUTION MODE</div>
        <ExecutionModeCard
          options={inheritOptions}
          value={inherit ? 'inherit' : 'custom'}
          onChange={id => setInherit(id === 'inherit')}
        />
      </PixelCard>

      {/* Inherited config preview */}
      {inherit && globalConfig.defaultMode === 'sandbox' && (
        <PixelCard>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            aria-expanded={advancedOpen}
            className="flex items-center gap-2 font-pixel text-[10px] text-text-secondary cursor-pointer hover:text-text-primary transition-colors w-full text-left"
          >
            <span className="transition-transform" style={{ transform: advancedOpen ? 'rotate(90deg)' : undefined }}>
              &#9654;
            </span>
            INHERITED CONFIGURATION
            <span className="text-[9px] text-text-dim font-mono ml-2">(read-only)</span>
          </button>

          <AnimatePresence>
            {advancedOpen && (
              <motion.div {...fadeInUp} className="mt-3 flex flex-col gap-2 text-[11px] text-text-dim font-mono">
                <div><span className="text-text-secondary">Mode:</span> {globalConfig.defaultMode}</div>
                <div><span className="text-text-secondary">Preset:</span> {globalConfig.sandboxPreset}</div>
                <div><span className="text-text-secondary">Allow Write:</span> {globalEffectiveConfig.filesystem.allowWrite.join(', ') || 'None'}</div>
                <div><span className="text-text-secondary">Deny Read:</span> {globalEffectiveConfig.filesystem.denyRead.join(', ') || 'None'}</div>
                <div><span className="text-text-secondary">Network:</span> {globalEffectiveConfig.network.allowedDomains.slice(0, 5).join(', ')}{globalEffectiveConfig.network.allowedDomains.length > 5 ? `, +${globalEffectiveConfig.network.allowedDomains.length - 5} more` : ''}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </PixelCard>
      )}

      {/* Custom configuration */}
      {!inherit && (
        <>
          {/* Mode selector */}
          <PixelCard>
            <div className="font-pixel text-[10px] text-text-secondary mb-3">EXECUTION MODE</div>
            <ExecutionModeCard
              options={modeOptions}
              value={mode}
              onChange={handleModeChange}
            />
          </PixelCard>

          {/* Preset selector */}
          {mode === 'sandbox' && (
            <PixelCard>
              <div className="font-pixel text-[10px] text-text-secondary mb-3">SANDBOX PRESET</div>
              <BashPresetSelector value={preset} onChange={handlePresetChange} />
            </PixelCard>
          )}

          {/* Advanced configuration */}
          {mode === 'sandbox' && (
            <PixelCard>
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                aria-expanded={advancedOpen}
                className="flex items-center gap-2 font-pixel text-[10px] text-text-secondary cursor-pointer hover:text-text-primary transition-colors w-full text-left"
              >
                <span className="transition-transform" style={{ transform: advancedOpen ? 'rotate(90deg)' : undefined }}>
                  &#9654;
                </span>
                ADVANCED CONFIGURATION
                {!isCustomPreset && (
                  <span className="text-[9px] text-text-dim font-mono ml-2">(read-only)</span>
                )}
              </button>

              <AnimatePresence>
                {advancedOpen && (
                  <motion.div {...fadeInUp} className="mt-4 flex flex-col gap-5">
                    <div>
                      <div className="font-pixel text-[9px] text-text-dim mb-3">FILE SYSTEM PERMISSIONS</div>
                      <div className="flex flex-col gap-4">
                        <PathListEditor
                          label="ALLOW WRITE"
                          items={displayConfig.filesystem.allowWrite}
                          onChange={items => updateFilesystem({ allowWrite: items })}
                          placeholder="Enter path or glob pattern..."
                          readOnly={!isCustomPreset}
                        />
                        <PathListEditor
                          label="DENY READ"
                          items={displayConfig.filesystem.denyRead}
                          onChange={items => updateFilesystem({ denyRead: items })}
                          placeholder="Enter path or glob pattern..."
                          readOnly={!isCustomPreset}
                        />
                        <PathListEditor
                          label="DENY WRITE"
                          items={displayConfig.filesystem.denyWrite}
                          onChange={items => updateFilesystem({ denyWrite: items })}
                          placeholder="Enter path or glob pattern..."
                          readOnly={!isCustomPreset}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="font-pixel text-[9px] text-text-dim mb-3">NETWORK PERMISSIONS</div>
                      <PathListEditor
                        label="ALLOWED DOMAINS"
                        items={displayConfig.network.allowedDomains}
                        onChange={items => updateNetwork({ allowedDomains: items })}
                        placeholder="Enter domain (e.g., *.github.com)..."
                        readOnly={!isCustomPreset}
                      />
                    </div>

                    <div>
                      <div className="font-pixel text-[9px] text-text-dim mb-3">OTHER</div>
                      <div className="flex flex-col gap-3">
                        <PixelToggle
                          checked={displayConfig.enablePython}
                          onChange={checked => isCustomPreset && updateCustomConfig({ enablePython: checked })}
                          disabled={!isCustomPreset}
                          label="Enable Python"
                        />
                        <PixelToggle
                          checked={displayConfig.filesystem.allowGitConfig}
                          onChange={checked => isCustomPreset && updateFilesystem({ allowGitConfig: checked })}
                          disabled={!isCustomPreset}
                          label="Allow Git Config"
                        />
                      </div>
                    </div>

                    <PathListEditor
                      label="DENIED COMMANDS"
                      items={displayConfig.deniedCommands}
                      onChange={items => updateCustomConfig({ deniedCommands: items })}
                      placeholder="Enter command pattern (e.g., sudo *)..."
                      readOnly={!isCustomPreset}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </PixelCard>
          )}
        </>
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
            This removes all sandbox protection for this project. AI agents will have full access to your system.
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-dim mb-3">
            <li>Read/write any file on your computer</li>
            <li>Execute any system command</li>
            <li>Access network without restrictions</li>
          </ul>
          <p className="text-text-dim">
            Only use this for local development in trusted environments.
          </p>
        </div>
      </PixelModal>
    </div>
  )
}
