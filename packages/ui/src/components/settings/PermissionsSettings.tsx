import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { PermissionMode, PermissionsConfig, PermissionsConfigFile, PermissionsConfigId, ProjectId, SandboxReadinessIssue, SandboxReadinessResult } from '@golemancy/shared'
import { DEFAULT_PERMISSIONS_CONFIG, isSandboxRuntimeSupported, type SupportedPlatform } from '@golemancy/shared'
import { fetchJson, getBaseUrl } from '../../services/http/base'
import { PixelCard, PixelButton, PixelInput, PixelModal, PixelToggle } from '../base'
import { PixelDropdown } from '../base/PixelDropdown'
import { ExecutionModeCard, type ExecutionModeOption } from './ExecutionModeCard'
import { PathListEditor } from './PathListEditor'
import { useServices, useCurrentProject, detectPlatform } from '../../hooks'
import { useAppStore } from '../../stores'

interface PermissionsSettingsProps {
  projectId: ProjectId
}

export function PermissionsSettings({ projectId }: PermissionsSettingsProps) {
  const { t } = useTranslation('permissions')
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
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Modal state
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [showUnrestrictedModal, setShowUnrestrictedModal] = useState(false)
  const [showSandboxUnavailableModal, setShowSandboxUnavailableModal] = useState(false)
  const [sandboxIssues, setSandboxIssues] = useState<SandboxReadinessIssue[]>([])


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
        restricted: t('modes.restricted.name'),
        sandbox: t('modes.sandbox.name'),
        unrestricted: t('modes.unrestricted.name'),
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

  async function handleModeChange(newMode: string) {
    if (newMode === 'unrestricted') {
      setShowUnrestrictedModal(true)
      return
    }
    if (newMode === 'sandbox') {
      try {
        const result = await fetchJson<SandboxReadinessResult>(
          `${getBaseUrl()}/api/sandbox/readiness?projectId=${projectId}`,
        )
        if (!result.available) {
          setSandboxIssues(result.issues)
          setShowSandboxUnavailableModal(true)
          return
        }
      } catch {
        // If readiness check fails, let the user proceed — runtime will degrade gracefully
      }
    }
    persistModeChange(newMode as PermissionMode)
  }

  function confirmUnrestricted() {
    setShowUnrestrictedModal(false)
    persistModeChange('unrestricted')
  }

  function confirmSandboxAnyway() {
    setShowSandboxUnavailableModal(false)
    setSandboxIssues([])
    persistModeChange('sandbox')
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
    try {
      await service.update(projectId, selectedConfigId, { mode, config })
      await saveProjectRef(selectedConfigId)
      await loadConfigs()
      showSavedIndicator()
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

  const MODE_OPTIONS: ExecutionModeOption[] = [
    {
      id: 'restricted',
      name: t('modes.restricted.name'),
      subtitle: t('modes.restricted.subtitle'),
      description: t('modes.restricted.description'),
      badge: { label: t('modes.restricted.badge'), variant: 'warning' },
    },
    {
      id: 'sandbox',
      name: t('modes.sandbox.name'),
      subtitle: t('modes.sandbox.subtitle'),
      description: t('modes.sandbox.description'),
      badge: { label: t('modes.sandbox.badge'), variant: 'success' },
    },
    {
      id: 'unrestricted',
      name: t('modes.unrestricted.name'),
      subtitle: t('modes.unrestricted.subtitle'),
      description: t('modes.unrestricted.description'),
      badge: { label: t('modes.unrestricted.badge'), variant: 'error' },
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="font-pixel text-[10px] text-text-dim">{t('loading')}</span>
      </div>
    )
  }

  const currentConfig = configs.find(c => c.id === selectedConfigId)
  const dropdownItems = configs.map(c => ({
    label: c.id === ('default' as PermissionsConfigId) ? t('config.default') : c.title,
    value: c.id,
    selected: c.id === selectedConfigId,
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* Permission Mode Selector */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('section.permissionMode')}</div>
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
            <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('section.configuration')}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <PixelDropdown
                trigger={
                  <PixelButton variant="ghost" className="min-w-[180px] text-left justify-between">
                    <span className="truncate font-mono text-[12px]">
                      {currentConfig
                        ? isDefault ? t('config.default') : currentConfig.title
                        : t('config.selectConfig')
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
                {saving ? t('common:button.saving') : t('common:button.save')}
              </PixelButton>
              <PixelButton variant="ghost" size="sm" onClick={openSaveAsModal}>
                {t('config.saveAs')}
              </PixelButton>
              {!isDefault && (
                <>
                  <PixelButton variant="ghost" size="sm" onClick={openRenameModal}>
                    {t('config.rename')}
                  </PixelButton>
                  <PixelButton variant="ghost" size="sm" className="text-accent-red hover:text-accent-red" onClick={() => setDeleteModalOpen(true)}>
                    {t('common:button.delete')}
                  </PixelButton>
                  <PixelButton variant="ghost" size="sm" className="ml-auto text-text-dim" onClick={handleResetToDefault}>
                    {t('config.resetToDefault')}
                  </PixelButton>
                </>
              )}

              {saved && <span className="text-[11px] text-accent-green ml-2 shrink-0">{t('config.saved')}</span>}
            </div>
            {isDefault && (
              <div className="mt-2 text-[10px] text-text-dim font-mono">
                {t('config.editingDefault')}
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
        title={t('modal.unrestrictedTitle')}
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setShowUnrestrictedModal(false)}>
              {t('common:button.cancel')}
            </PixelButton>
            <PixelButton variant="danger" size="sm" onClick={confirmUnrestricted}>
              {t('modal.enableUnrestricted')}
            </PixelButton>
          </>
        }
      >
        <div className="text-[12px] text-text-secondary leading-relaxed">
          <p className="mb-3">
            {t('modal.unrestrictedBody')}
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-dim mb-3">
            <li>{t('modal.unrestrictedReadWrite')}</li>
            <li>{t('modal.unrestrictedExecute')}</li>
            <li>{t('modal.unrestrictedNetwork')}</li>
            <li>{t('modal.unrestrictedSysconfig')}</li>
          </ul>
          <p className="text-text-dim">
            {t('modal.unrestrictedFooter')}
          </p>
        </div>
      </PixelModal>

      {/* Sandbox Unavailable Modal */}
      <PixelModal
        open={showSandboxUnavailableModal}
        onClose={() => setShowSandboxUnavailableModal(false)}
        title={t('modal.sandboxUnavailableTitle')}
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setShowSandboxUnavailableModal(false)}>
              {t('common:button.cancel')}
            </PixelButton>
            <PixelButton variant="secondary" size="sm" className="text-accent-amber border-accent-amber" onClick={confirmSandboxAnyway}>
              {t('modal.enableAnyway')}
            </PixelButton>
          </>
        }
      >
        <div className="text-[12px] text-text-secondary leading-relaxed">
          <p className="mb-3">
            {t('modal.sandboxUnavailableBody')}
          </p>
          <div className="flex flex-col gap-2">
            {sandboxIssues.map((issue, i) => (
              <div key={i} className="border-2 border-border-dim p-2 bg-deep">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-accent-amber font-pixel text-[9px]">{issue.component}</span>
                </div>
                <p className="text-text-dim text-[11px]">{issue.message}</p>
                {issue.fix && (
                  <p className="font-mono text-[10px] text-text-dim mt-1 opacity-70">{issue.fix}</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-text-dim mt-3">
            {t('modal.sandboxUnavailableFooter')}
          </p>
        </div>
      </PixelModal>

      {/* Save As Modal */}
      <PixelModal
        open={saveAsModalOpen}
        onClose={() => setSaveAsModalOpen(false)}
        title={t('modal.saveAsTitle')}
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setSaveAsModalOpen(false)}>
              {t('common:button.cancel')}
            </PixelButton>
            <PixelButton variant="primary" size="sm" onClick={handleSaveAs} disabled={!modalTitle.trim() || saving}>
              {saving ? t('common:button.saving') : t('common:button.save')}
            </PixelButton>
          </>
        }
      >
        <PixelInput
          label={t('modal.configNameLabel')}
          value={modalTitle}
          onChange={e => setModalTitle(e.target.value)}
          placeholder={t('modal.configNamePlaceholder')}
        />
      </PixelModal>

      {/* Rename Modal */}
      <PixelModal
        open={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title={t('modal.renameTitle')}
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setRenameModalOpen(false)}>
              {t('common:button.cancel')}
            </PixelButton>
            <PixelButton variant="primary" size="sm" onClick={handleRename} disabled={!modalTitle.trim() || saving}>
              {saving ? t('modal.renaming') : t('config.rename')}
            </PixelButton>
          </>
        }
      >
        <PixelInput
          label={t('modal.newNameLabel')}
          value={modalTitle}
          onChange={e => setModalTitle(e.target.value)}
          placeholder={t('modal.newNamePlaceholder')}
        />
      </PixelModal>

      {/* Delete Confirmation Modal */}
      <PixelModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t('modal.deleteTitle', { title: currentConfig?.title ?? '' })}
        size="sm"
        footer={
          <>
            <PixelButton variant="ghost" size="sm" onClick={() => setDeleteModalOpen(false)}>
              {t('common:button.cancel')}
            </PixelButton>
            <PixelButton variant="danger" size="sm" onClick={handleDelete} disabled={saving}>
              {saving ? t('common:button.deleting') : t('common:button.delete')}
            </PixelButton>
          </>
        }
      >
        <p className="text-[12px] text-text-secondary">
          {t('modal.deleteBody')}
        </p>
      </PixelModal>
    </div>
  )
}

// ========== Domain Validation ==========
function validateDomainPattern(value: string): string | null {
  if (value.includes('://') || value.includes('/') || value.includes(':'))
    return 'removeProtocol'
  if (value === 'localhost') return null
  if (value.startsWith('*.')) {
    const domain = value.slice(2)
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.'))
      return 'wildcardParts'
    const parts = domain.split('.')
    if (parts.length < 2 || parts.some(p => p.length === 0))
      return 'wildcardParts'
    return null
  }
  if (value.includes('*'))
    return 'onlyWildcard'
  if (!value.includes('.') || value.startsWith('.') || value.endsWith('.'))
    return 'validDomain'
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
  const { t } = useTranslation('permissions')

  function translateValidation(key: string | null): string | null {
    if (!key) return null
    return t(`validation.${key}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[9px] text-text-dim mb-3">{t('filesystem.sectionTitle')}</div>
        <div className="flex flex-col gap-4">
          <PathListEditor
            label={t('filesystem.allowWrite')}
            items={config.allowWrite}
            onChange={items => onUpdate({ allowWrite: items })}
            placeholder={t('filesystem.allowWritePlaceholder')}
            helperText={t('filesystem.allowWriteHelper')}
          />
          <PathListEditor
            label={t('filesystem.denyRead')}
            items={config.denyRead}
            onChange={items => onUpdate({ denyRead: items })}
            placeholder={t('filesystem.denyReadPlaceholder')}
            helperText={t('filesystem.denyReadHelper')}
          />
          <PathListEditor
            label={t('filesystem.denyWrite')}
            items={config.denyWrite}
            onChange={items => onUpdate({ denyWrite: items })}
            placeholder={t('filesystem.denyWritePlaceholder')}
            helperText={t('filesystem.denyWriteHelper')}
          />
        </div>
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[9px] text-text-dim mb-3">{t('network.sectionTitle')}</div>
        <div className="flex items-center gap-2">
          <PixelToggle
            checked={config.networkRestrictionsEnabled}
            onChange={checked => onUpdate({ networkRestrictionsEnabled: checked })}
            label={t('network.enableLabel')}
          />
          <span className="font-mono text-[11px] text-text-dim">
            {config.networkRestrictionsEnabled
              ? t('network.statusEnabled')
              : t('network.statusDisabled')}
          </span>
        </div>

        {config.networkRestrictionsEnabled && (
          <div className="flex flex-col gap-4 mt-4">
            <PathListEditor
              label={t('network.allowedDomains')}
              items={config.allowedDomains}
              onChange={items => onUpdate({ allowedDomains: items })}
              placeholder={t('network.allowedDomainsPlaceholder')}
              helperText={t('network.allowedDomainsHelper')}
              validateItem={v => translateValidation(validateDomainPattern(v))}
            />
            <PathListEditor
              label={t('network.deniedDomains')}
              items={config.deniedDomains}
              onChange={items => onUpdate({ deniedDomains: items })}
              placeholder={t('network.deniedDomainsPlaceholder')}
              helperText={t('network.deniedDomainsHelper')}
              validateItem={v => translateValidation(validateDomainPattern(v))}
            />
          </div>
        )}
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[9px] text-text-dim mb-3">{t('commands.sectionTitle')}</div>
        <PathListEditor
          label={t('commands.deniedCommands')}
          items={config.deniedCommands}
          onChange={items => onUpdate({ deniedCommands: items })}
          placeholder={t('commands.deniedCommandsPlaceholder')}
          helperText={t('commands.deniedCommandsHelper')}
        />
      </PixelCard>

      <PixelCard>
        <div className="flex items-center gap-2">
          <PixelToggle
            checked={config.applyToMCP}
            onChange={checked => onUpdate({ applyToMCP: checked })}
            label={t('mcp.applyLabel')}
          />
          {!config.applyToMCP && (
            <span className="font-mono text-[11px] text-accent-amber">
              {t('mcp.warning')}
            </span>
          )}
        </div>
        <p className="mt-2 font-mono text-[11px] text-text-dim">
          {t('mcp.description')}
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
  const { t } = useTranslation('permissions')

  return (
    <div className="flex flex-col gap-4">
      <PixelCard variant="outlined" className="border-accent-amber">
        <div className="font-pixel text-[10px] text-accent-amber mb-2">
          {t('windows.notice')}
        </div>
        <p className="font-mono text-[11px] text-text-secondary">
          {t('windows.message')}
        </p>
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[9px] text-text-dim mb-3">{t('commands.sectionTitle')}</div>
        <PathListEditor
          label={t('commands.deniedCommands')}
          items={config.deniedCommands}
          onChange={items => onUpdate({ deniedCommands: items })}
          placeholder={t('commands.deniedCommandsPlaceholder')}
          helperText={t('commands.deniedCommandsHelper')}
        />
      </PixelCard>
    </div>
  )
}
