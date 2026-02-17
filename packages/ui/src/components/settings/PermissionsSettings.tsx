import { useState, useEffect, useRef, useCallback } from 'react'
import type { PermissionMode, PermissionsConfig, PermissionsConfigFile, PermissionsConfigId, ProjectId } from '@golemancy/shared'
import { DEFAULT_PERMISSIONS_CONFIG, isSandboxRuntimeSupported, type SupportedPlatform } from '@golemancy/shared'
import { PixelCard, PixelButton, PixelInput, PixelModal, PixelToggle } from '../base'
import { PixelDropdown } from '../base/PixelDropdown'
import { ExecutionModeCard, type ExecutionModeOption } from './ExecutionModeCard'
import { PathListEditor } from './PathListEditor'
import { useServices, useCurrentProject, detectPlatform } from '../../hooks'
import { useAppStore } from '../../stores'

interface PermissionsSettingsProps {
  projectId: ProjectId
}

const MODE_OPTIONS: ExecutionModeOption[] = [
  {
    id: 'restricted',
    name: 'Restricted',
    subtitle: 'Just Bash, no sandbox',
    description: 'Minimal execution environment. No sandbox runtime, no MCP support.',
    badge: { label: 'Limited', variant: 'warning' },
  },
  {
    id: 'sandbox',
    name: 'Sandbox',
    subtitle: 'Configurable isolation',
    description: 'Sandbox runtime with configurable filesystem, network, and command restrictions.',
    badge: { label: 'Recommended', variant: 'success' },
  },
  {
    id: 'unrestricted',
    name: 'Unrestricted',
    subtitle: 'Full system access',
    description: 'No sandbox restrictions. All commands run with full system permissions.',
    badge: { label: 'Risky', variant: 'error' },
  },
]

export function PermissionsSettings({ projectId }: PermissionsSettingsProps) {
  const { permissionsConfig: service } = useServices()
  const project = useCurrentProject()
  const updateProject = useAppStore(s => s.updateProject)
  const platform = detectPlatform()
  const isWindows = !isSandboxRuntimeSupported(platform)

  const savedConfigId = project?.config.permissionsConfigId ?? ('default' as PermissionsConfigId)

  // State
  const [configs, setConfigs] = useState<PermissionsConfigFile[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<PermissionsConfigId>(savedConfigId)
  const [mode, setMode] = useState<PermissionMode>('sandbox')
  const [config, setConfig] = useState<PermissionsConfig>({ ...DEFAULT_PERMISSIONS_CONFIG.config })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Modal state
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [showUnrestrictedModal, setShowUnrestrictedModal] = useState(false)

  const isDefault = selectedConfigId === ('default' as PermissionsConfigId)

  useEffect(() => () => { clearTimeout(timerRef.current) }, [])

  // Sync selected config when project's saved config changes (e.g., project switch)
  useEffect(() => {
    setSelectedConfigId(savedConfigId)
  }, [savedConfigId])

  // Load configs list
  const loadConfigs = useCallback(async () => {
    try {
      const list = await service.list(projectId)
      setConfigs(list)
    } catch {
      setConfigs([DEFAULT_PERMISSIONS_CONFIG])
    }
  }, [service, projectId])

  useEffect(() => {
    setLoading(true)
    loadConfigs().finally(() => setLoading(false))
  }, [loadConfigs])

  // When selected config or configs list changes, load the config data into editor
  useEffect(() => {
    const cfg = configs.find(c => c.id === selectedConfigId)
    if (cfg) {
      setMode(cfg.mode)
      setConfig({ ...cfg.config })
    } else if (configs.length > 0 && selectedConfigId !== ('default' as PermissionsConfigId)) {
      // Selected config not found (deleted?), fall back to default
      const defaultCfg = configs.find(c => c.id === ('default' as PermissionsConfigId))
      if (defaultCfg) {
        setSelectedConfigId('default' as PermissionsConfigId)
      }
    }
  }, [selectedConfigId, configs])

  /** Persist mode change: update config file (or create one) + update project ref */
  async function persistModeChange(newMode: PermissionMode) {
    setMode(newMode)
    if (isDefault) {
      // Create a new config with the new mode
      const titleMap: Record<PermissionMode, string> = {
        restricted: 'Restricted',
        sandbox: 'Sandbox',
        unrestricted: 'Unrestricted',
      }
      const created = await service.create(projectId, {
        title: titleMap[newMode],
        mode: newMode,
        config,
      })
      await saveProjectRef(created.id)
      await loadConfigs()
      setSelectedConfigId(created.id)
    } else {
      // Update existing config's mode
      await service.update(projectId, selectedConfigId, { mode: newMode })
      await saveProjectRef(selectedConfigId)
      await loadConfigs()
    }
    showSavedIndicator()
  }

  function handleModeChange(newMode: string) {
    if (newMode === 'unrestricted') {
      setShowUnrestrictedModal(true)
      return
    }
    persistModeChange(newMode as PermissionMode)
  }

  function confirmUnrestricted() {
    setShowUnrestrictedModal(false)
    persistModeChange('unrestricted')
  }

  function updateConfig(partial: Partial<PermissionsConfig>) {
    setConfig(prev => ({ ...prev, ...partial }))
  }

  function showSavedIndicator() {
    clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => setSaved(false), 2000)
  }

  /** Persist which config the project references */
  async function saveProjectRef(configId: PermissionsConfigId | undefined) {
    if (!project) return
    const newRef = configId === ('default' as PermissionsConfigId) ? undefined : configId
    await updateProject(project.id, {
      config: { ...project.config, permissionsConfigId: newRef },
    })
  }

  // Save: update existing custom config, or prompt name for default
  async function handleSave() {
    if (isDefault) {
      // Default is immutable on disk — open "Save As" modal
      setModalTitle('')
      setSaveAsModalOpen(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await service.update(projectId, selectedConfigId, { mode, config })
      await saveProjectRef(selectedConfigId)
      await loadConfigs()
      showSavedIndicator()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  // Save As: create new config with given name
  async function handleSaveAs() {
    if (!modalTitle.trim()) return
    setSaving(true)
    try {
      const created = await service.create(projectId, {
        title: modalTitle.trim(),
        mode,
        config,
      })
      await saveProjectRef(created.id)
      await loadConfigs()
      setSelectedConfigId(created.id)
      setSaveAsModalOpen(false)
      showSavedIndicator()
    } finally {
      setSaving(false)
    }
  }

  // Rename existing config
  async function handleRename() {
    if (!modalTitle.trim() || isDefault) return
    setSaving(true)
    try {
      await service.update(projectId, selectedConfigId, { title: modalTitle.trim() })
      await loadConfigs()
      setRenameModalOpen(false)
      showSavedIndicator()
    } finally {
      setSaving(false)
    }
  }

  // Delete existing config — revert project to default
  async function handleDelete() {
    if (isDefault) return
    setSaving(true)
    try {
      await service.delete(projectId, selectedConfigId)
      await saveProjectRef(undefined)
      setSelectedConfigId('default' as PermissionsConfigId)
      await loadConfigs()
      setDeleteModalOpen(false)
      showSavedIndicator()
    } finally {
      setSaving(false)
    }
  }

  // Reset editor to default values
  function handleResetToDefault() {
    setSelectedConfigId('default' as PermissionsConfigId)
  }

  function handleConfigSelect(value: string) {
    setSelectedConfigId(value as PermissionsConfigId)
  }

  function openSaveAsModal() {
    const current = configs.find(c => c.id === selectedConfigId)
    setModalTitle(isDefault ? '' : `${current?.title ?? ''} (copy)`)
    setSaveAsModalOpen(true)
  }

  function openRenameModal() {
    const current = configs.find(c => c.id === selectedConfigId)
    setModalTitle(current?.title ?? '')
    setRenameModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="font-pixel text-[10px] text-text-dim">Loading permissions...</span>
      </div>
    )
  }

  const currentConfig = configs.find(c => c.id === selectedConfigId)
  const dropdownItems = configs.map(c => ({
    label: c.id === ('default' as PermissionsConfigId) ? 'Default' : c.title,
    value: c.id,
    selected: c.id === selectedConfigId,
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* Permission Mode Selector */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">PERMISSION MODE</div>
        <ExecutionModeCard
          options={MODE_OPTIONS}
          value={mode}
          onChange={handleModeChange}
        />
      </PixelCard>

      {/* Config Management + Detail Editor — only visible in sandbox mode */}
      {mode === 'sandbox' && (
        <>
          <PixelCard variant="elevated">
            <div className="font-pixel text-[10px] text-text-secondary mb-3">CONFIGURATION</div>
            <div className="flex items-center gap-2 flex-wrap">
              <PixelDropdown
                trigger={
                  <PixelButton variant="ghost" className="min-w-[180px] text-left justify-between">
                    <span className="truncate font-mono text-[12px]">
                      {currentConfig
                        ? isDefault ? 'Default' : currentConfig.title
                        : 'Select config...'
                      }
                    </span>
                    <span className="ml-2 text-text-dim">{'\u25BC'}</span>
                  </PixelButton>
                }
                items={dropdownItems}
                onSelect={handleConfigSelect}
                dividerAfter={[0]}
              />

              <PixelButton variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </PixelButton>
              <PixelButton variant="ghost" size="sm" onClick={openSaveAsModal}>
                Save As...
              </PixelButton>
              {!isDefault && (
                <>
                  <PixelButton variant="ghost" size="sm" onClick={openRenameModal}>
                    Rename
                  </PixelButton>
                  <PixelButton variant="ghost" size="sm" className="text-accent-red hover:text-accent-red" onClick={() => setDeleteModalOpen(true)}>
                    Delete
                  </PixelButton>
                  <PixelButton variant="ghost" size="sm" className="ml-auto text-text-dim" onClick={handleResetToDefault}>
                    Reset to Default
                  </PixelButton>
                </>
              )}

              {saved && <span className="text-[11px] text-accent-green ml-2 shrink-0">Saved!</span>}
              {saveError && <span className="text-[11px] text-accent-red ml-2 shrink-0">{saveError}</span>}
            </div>
            {isDefault && (
              <div className="mt-2 text-[10px] text-text-dim font-mono">
                Editing default values. Click Save to create a new named configuration.
              </div>
            )}
          </PixelCard>

          {isWindows ? (
            <WindowsLimitedView config={config} onUpdate={updateConfig} />
          ) : (
            <SandboxConfigEditor config={config} onUpdate={updateConfig} />
          )}
        </>
      )}

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

      {/* Save As Modal */}
      <PixelModal
        open={saveAsModalOpen}
        onClose={() => setSaveAsModalOpen(false)}
        title="Save As New Configuration"
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setSaveAsModalOpen(false)}>
              Cancel
            </PixelButton>
            <PixelButton variant="primary" size="sm" onClick={handleSaveAs} disabled={!modalTitle.trim() || saving}>
              {saving ? 'Saving...' : 'Save'}
            </PixelButton>
          </>
        }
      >
        <PixelInput
          label="CONFIG NAME"
          value={modalTitle}
          onChange={e => setModalTitle(e.target.value)}
          placeholder="e.g., Strict Dev, Python Disabled"
        />
      </PixelModal>

      {/* Rename Modal */}
      <PixelModal
        open={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title="Rename Configuration"
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setRenameModalOpen(false)}>
              Cancel
            </PixelButton>
            <PixelButton variant="primary" size="sm" onClick={handleRename} disabled={!modalTitle.trim() || saving}>
              {saving ? 'Renaming...' : 'Rename'}
            </PixelButton>
          </>
        }
      >
        <PixelInput
          label="NEW NAME"
          value={modalTitle}
          onChange={e => setModalTitle(e.target.value)}
          placeholder="e.g., My Custom Config"
        />
      </PixelModal>

      {/* Delete Confirmation Modal */}
      <PixelModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={`Delete "${currentConfig?.title ?? ''}"?`}
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </PixelButton>
            <PixelButton variant="danger" size="sm" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete'}
            </PixelButton>
          </>
        }
      >
        <p className="text-[12px] text-text-secondary">
          This configuration will be permanently deleted. The project will revert to system defaults.
        </p>
      </PixelModal>
    </div>
  )
}

// ========== Domain Validation ==========
function validateDomainPattern(value: string): string | null {
  if (value.includes('://') || value.includes('/') || value.includes(':'))
    return 'Remove protocol, path, or port — just the domain'
  if (value === 'localhost') return null
  if (value.startsWith('*.')) {
    const domain = value.slice(2)
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.'))
      return 'Wildcard needs 2+ parts after *. (e.g., *.example.com)'
    const parts = domain.split('.')
    if (parts.length < 2 || parts.some(p => p.length === 0))
      return 'Wildcard needs 2+ parts after *. (e.g., *.example.com)'
    return null
  }
  if (value.includes('*'))
    return 'Only *.domain.com wildcard format is supported'
  if (!value.includes('.') || value.startsWith('.') || value.endsWith('.'))
    return 'Must be a valid domain with at least one dot (e.g., example.com)'
  return null
}

// ========== SandboxConfigEditor ==========
function SandboxConfigEditor({
  config,
  onUpdate,
}: {
  config: PermissionsConfig
  onUpdate: (partial: Partial<PermissionsConfig>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[9px] text-text-dim mb-3">FILESYSTEM PERMISSIONS</div>
        <div className="flex flex-col gap-4">
          <PathListEditor
            label="ALLOW WRITE"
            items={config.allowWrite}
            onChange={items => onUpdate({ allowWrite: items })}
            placeholder="e.g., /Users/name/workspace"
            helperText="Paths where agents can write files. Default: project workspace directory."
          />
          <PathListEditor
            label="DENY READ"
            items={config.denyRead}
            onChange={items => onUpdate({ denyRead: items })}
            placeholder="e.g., ~/.ssh, .env"
            helperText="Sensitive files/folders to block from reading."
          />
          <PathListEditor
            label="DENY WRITE"
            items={config.denyWrite}
            onChange={items => onUpdate({ denyWrite: items })}
            placeholder="e.g., /etc, /usr"
            helperText="Paths where writing is blocked. Takes precedence over allow write."
          />
        </div>
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[9px] text-text-dim mb-3">NETWORK RESTRICTIONS</div>
        <div className="flex items-center gap-2">
          <PixelToggle
            checked={config.networkRestrictionsEnabled}
            onChange={checked => onUpdate({ networkRestrictionsEnabled: checked })}
            label="Enable"
          />
          <span className="font-mono text-[11px] text-text-dim">
            {config.networkRestrictionsEnabled
              ? 'Only configured domains are accessible'
              : 'All network traffic is allowed'}
          </span>
        </div>

        {config.networkRestrictionsEnabled && (
          <div className="flex flex-col gap-4 mt-4">
            <PathListEditor
              label="ALLOWED DOMAINS"
              items={config.allowedDomains}
              onChange={items => onUpdate({ allowedDomains: items })}
              placeholder="e.g., api.github.com"
              helperText="Domains agents can access. Exact: example.com — Wildcard: *.example.com (2+ parts after *.)"
              validateItem={validateDomainPattern}
            />
            <PathListEditor
              label="DENIED DOMAINS"
              items={config.deniedDomains}
              onChange={items => onUpdate({ deniedDomains: items })}
              placeholder="e.g., malicious-site.com"
              helperText="Domains to block. Same format as allowed domains."
              validateItem={validateDomainPattern}
            />
          </div>
        )}
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[9px] text-text-dim mb-3">COMMAND RESTRICTIONS</div>
        <PathListEditor
          label="DENIED COMMANDS"
          items={config.deniedCommands}
          onChange={items => onUpdate({ deniedCommands: items })}
          placeholder="e.g., python, python3, pip"
          helperText="Commands to block from execution."
        />
      </PixelCard>

      <PixelCard>
        <div className="flex items-center gap-2">
          <PixelToggle
            checked={config.applyToMCP}
            onChange={checked => onUpdate({ applyToMCP: checked })}
            label="Apply to MCP"
          />
          {!config.applyToMCP && (
            <span className="font-mono text-[11px] text-accent-amber">
              ({'\u26A0'} Disabling this may allow third-party MCP servers to access or modify files on your computer)
            </span>
          )}
        </div>
        <p className="mt-2 font-mono text-[11px] text-text-dim">
          When enabled, MCP server commands will be wrapped with sandbox runtime (srt). This applies the same filesystem, network, and command restrictions to MCP servers.
        </p>
      </PixelCard>
    </div>
  )
}

// ========== WindowsLimitedView ==========
function WindowsLimitedView({
  config,
  onUpdate,
}: {
  config: PermissionsConfig
  onUpdate: (partial: Partial<PermissionsConfig>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <PixelCard variant="outlined" className="border-accent-amber">
        <div className="font-pixel text-[10px] text-accent-amber mb-2">
          {'\u26A0'} WINDOWS NOTICE
        </div>
        <p className="font-mono text-[11px] text-text-secondary">
          Sandbox runtime is not available on Windows. Only command blocking is supported.
        </p>
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[9px] text-text-dim mb-3">COMMAND RESTRICTIONS</div>
        <PathListEditor
          label="DENIED COMMANDS"
          items={config.deniedCommands}
          onChange={items => onUpdate({ deniedCommands: items })}
          placeholder="e.g., python, python3, pip"
          helperText="Commands to block from execution."
        />
      </PixelCard>
    </div>
  )
}
