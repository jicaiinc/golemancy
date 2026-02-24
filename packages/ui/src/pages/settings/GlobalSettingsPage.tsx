import { useState, useCallback } from 'react'
import type { ProviderSdkType, ProviderEntry, ThemeMode, GlobalSettings, AgentModelConfig } from '@golemancy/shared'
import { APP_VERSION } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useServices } from '../../hooks'
import { PixelCard, PixelButton, PixelInput, PixelTabs } from '../../components'
import { GlobalLayout } from '../../app/layouts/GlobalLayout'
import { SpeechTab } from './SpeechTab'

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'providers', label: 'Providers' },
  { id: 'speech', label: 'Speech' },
]

const PROVIDER_PRESETS: Record<string, { name: string; sdkType: ProviderSdkType; defaultModels: string[]; defaultBaseUrl?: string }> = {
  anthropic: { name: 'Anthropic', sdkType: 'anthropic', defaultModels: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-6'] },
  openai: { name: 'OpenAI', sdkType: 'openai', defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  google: { name: 'Google', sdkType: 'google', defaultModels: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  deepseek: { name: 'DeepSeek', sdkType: 'deepseek', defaultModels: ['deepseek-chat', 'deepseek-reasoner'] },
  xai: { name: 'xAI (Grok)', sdkType: 'xai', defaultModels: ['grok-3', 'grok-3-mini'] },
  groq: { name: 'Groq', sdkType: 'groq', defaultModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'] },
  mistral: { name: 'Mistral', sdkType: 'mistral', defaultModels: ['mistral-large-latest', 'codestral-latest'] },
  moonshot: { name: 'Moonshot (Kimi)', sdkType: 'moonshot', defaultModels: ['kimi-k2', 'moonshot-v1-128k'] },
  alibaba: { name: 'Alibaba (Qwen)', sdkType: 'alibaba', defaultModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'] },
}

const SDK_TYPE_OPTIONS: { value: ProviderSdkType; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'groq', label: 'Groq' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'moonshot', label: 'Moonshot (Kimi)' },
  { value: 'alibaba', label: 'Alibaba (Qwen)' },
  { value: 'openai-compatible', label: 'OpenAI-Compatible' },
]

function isLocalUrl(url?: string): boolean {
  if (!url) return false
  return url.includes('localhost') || url.includes('127.0.0.1')
}

/** Whether the provider has credentials (API key or localhost) */
function hasCredentials(entry: ProviderEntry): boolean {
  return !!(entry.apiKey || isLocalUrl(entry.baseUrl))
}

/** Whether the provider is available for selection (test passed) */
function isProviderAvailable(entry: ProviderEntry): boolean {
  return entry.testStatus === 'ok'
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function GlobalSettingsPage() {
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const [activeTab, setActiveTab] = useState('general')

  if (!settings) return null

  return (
    <GlobalLayout>
      <div data-testid="settings-form" className="max-w-[1000px] mx-auto p-8">
        {/* Page heading */}
        <h2 className="font-pixel text-[12px] text-text-primary mb-6">Global Settings</h2>

        <PixelTabs tabs={SETTINGS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-4">
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'providers' && (
            <ProvidersTab settings={settings} onUpdate={updateSettings} />
          )}
          {activeTab === 'speech' && <SpeechTab />}
        </div>

        {/* About footer */}
        <div className="mt-8 pt-4 border-t-2 border-border-dim text-center">
          <span className="text-[11px] text-text-dim">
            Golemancy v{APP_VERSION} — AI Agent Orchestrator for Super Individuals
          </span>
        </div>
      </div>
    </GlobalLayout>
  )
}

// ========== Providers Tab ==========
function ProvidersTab({ settings, onUpdate }: {
  settings: GlobalSettings
  onUpdate: (data: Partial<GlobalSettings>) => Promise<void>
}) {
  const [addMode, setAddMode] = useState<false | 'select' | 'custom'>(false)
  const [customName, setCustomName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customSdkType, setCustomSdkType] = useState<ProviderSdkType>('openai-compatible')

  // Defensive: providers may be undefined or old array format from v1 data
  const providers = (settings.providers && !Array.isArray(settings.providers)) ? settings.providers : {}
  const providerKeys = Object.keys(providers)

  // Available providers (test passed)
  const availableProviders = Object.entries(providers).filter(
    ([, entry]) => isProviderAvailable(entry),
  )

  // Presets not yet added
  const remainingPresets = Object.entries(PROVIDER_PRESETS).filter(([key]) => !providers[key])

  async function handleAddPreset(key: string) {
    const preset = PROVIDER_PRESETS[key]
    if (!preset) return
    const updated = { ...providers }
    updated[key] = {
      name: preset.name,
      sdkType: preset.sdkType,
      models: [...preset.defaultModels],
      baseUrl: preset.defaultBaseUrl,
    }
    await onUpdate({ providers: updated })
    setAddMode(false)
  }

  async function handleAddCustom() {
    const name = customName.trim()
    if (!name) return
    const slug = slugify(name) || 'custom'
    const updated = { ...providers }
    let finalSlug = slug
    if (updated[finalSlug]) {
      let i = 2
      while (updated[`${slug}-${i}`]) i++
      finalSlug = `${slug}-${i}`
    }
    updated[finalSlug] = {
      name,
      sdkType: customSdkType,
      models: [],
      baseUrl: customBaseUrl.trim() || undefined,
    }
    await onUpdate({ providers: updated })
    setAddMode(false)
    setCustomName('')
    setCustomBaseUrl('')
    setCustomSdkType('openai-compatible')
  }

  async function handleDeleteProvider(key: string) {
    const updated = { ...providers }
    delete updated[key]
    // Clear defaultModel if it references the deleted provider
    const patch: Partial<GlobalSettings> = { providers: updated }
    if (settings.defaultModel?.provider === key) {
      patch.defaultModel = undefined
    }
    await onUpdate(patch)
  }

  async function handleUpdateProvider(key: string, entry: ProviderEntry) {
    await onUpdate({ providers: { ...providers, [key]: entry } })
  }

  async function handleDefaultModelChange(model: AgentModelConfig | undefined) {
    await onUpdate({ defaultModel: model })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Default Model Selector */}
      <DefaultModelSection
        providers={providers}
        availableProviders={availableProviders}
        defaultModel={settings.defaultModel}
        onChange={handleDefaultModelChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-pixel text-[10px] text-text-secondary">PROVIDERS</div>
        <PixelButton size="sm" variant="primary" onClick={() => setAddMode(addMode ? false : 'select')}>
          {addMode ? 'Cancel' : '+ Add Provider'}
        </PixelButton>
      </div>

      {/* Add Provider Panel */}
      {addMode === 'select' && (
        <PixelCard variant="outlined">
          <div className="font-pixel text-[10px] text-text-secondary mb-3">SELECT PROVIDER</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {remainingPresets.map(([key, preset]) => (
              <button
                key={key}
                onClick={() => handleAddPreset(key)}
                className="p-3 border-2 border-border-dim bg-deep hover:border-border-bright cursor-pointer transition-colors text-left"
              >
                <div className="text-[11px] text-text-primary">{preset.name}</div>
                <div className="text-[9px] text-text-dim mt-1">{preset.sdkType}</div>
              </button>
            ))}
            <button
              onClick={() => setAddMode('custom')}
              className="p-3 border-2 border-border-dim border-dashed bg-deep hover:border-border-bright cursor-pointer transition-colors text-left"
            >
              <div className="text-[11px] text-text-primary">Custom</div>
              <div className="text-[9px] text-text-dim mt-1">any endpoint</div>
            </button>
          </div>
        </PixelCard>
      )}

      {addMode === 'custom' && (
        <PixelCard variant="outlined">
          <div className="font-pixel text-[10px] text-text-secondary mb-3">CUSTOM PROVIDER</div>
          <div className="flex flex-col gap-3">
            <PixelInput
              label="NAME"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="My Provider"
            />
            <PixelInput
              label="BASE URL"
              value={customBaseUrl}
              onChange={e => setCustomBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
            <div>
              <label className="font-pixel text-[8px] text-text-dim block mb-1">SDK TYPE</label>
              <select
                value={customSdkType}
                onChange={e => setCustomSdkType(e.target.value as ProviderSdkType)}
                className="w-full h-9 bg-deep px-3 text-[12px] text-text-primary font-mono border-2 border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none"
              >
                {SDK_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <PixelButton size="sm" variant="primary" onClick={handleAddCustom}>Add</PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => setAddMode('select')}>Back</PixelButton>
            </div>
          </div>
        </PixelCard>
      )}

      {/* Provider Cards */}
      {providerKeys.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-6">
          <p className="text-[12px] text-text-dim">No providers configured. Click "+ Add Provider" to get started.</p>
        </PixelCard>
      ) : (
        providerKeys.map(key => (
          <ProviderCard
            key={key}
            providerKey={key}
            entry={providers[key]}
            onUpdate={entry => handleUpdateProvider(key, entry)}
            onDelete={() => handleDeleteProvider(key)}
          />
        ))
      )}
    </div>
  )
}

// ========== Default Model Section ==========
function DefaultModelSection({ providers, availableProviders, defaultModel, onChange }: {
  providers: Record<string, ProviderEntry>
  availableProviders: [string, ProviderEntry][]
  defaultModel?: AgentModelConfig
  onChange: (model: AgentModelConfig | undefined) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [provider, setProvider] = useState(defaultModel?.provider ?? '')
  const [model, setModel] = useState(defaultModel?.model ?? '')

  const selectedEntry = providers[provider]
  const models = selectedEntry?.models ?? []

  function handleProviderChange(slug: string) {
    setProvider(slug)
    const entry = providers[slug]
    setModel(entry?.models[0] ?? '')
  }

  async function handleSave() {
    setSaving(true)
    if (provider && model) {
      await onChange({ provider, model })
    } else {
      await onChange(undefined)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <PixelCard>
      <div className="font-pixel text-[10px] text-text-secondary mb-2">DEFAULT MODEL</div>
      <p className="text-[11px] text-text-dim mb-3">Used when creating new projects and agents.</p>
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">PROVIDER</label>
          <select
            value={provider}
            onChange={e => handleProviderChange(e.target.value)}
            className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
          >
            <option value="">-- None --</option>
            {availableProviders.map(([slug, entry]) => (
              <option key={slug} value={slug}>{entry.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">MODEL</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue cursor-pointer"
          >
            {!provider && <option value="">-- Select provider first --</option>}
            {provider && models.length === 0 && <option value="">No models available</option>}
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <PixelButton size="sm" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '...' : 'Save'}
          </PixelButton>
          {saved && <span className="text-[11px] text-accent-green">Saved!</span>}
        </div>
      </div>
    </PixelCard>
  )
}

// ========== Provider Card ==========
function ProviderCard({ providerKey, entry, onUpdate, onDelete }: {
  providerKey: string
  entry: ProviderEntry
  onUpdate: (entry: ProviderEntry) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const services = useServices()
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState(entry.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(entry.baseUrl ?? '')
  const [name, setName] = useState(entry.name)
  const [showKey, setShowKey] = useState(false)
  const [modelsExpanded, setModelsExpanded] = useState(false)
  const [newModel, setNewModel] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const [testLatency, setTestLatency] = useState(0)

  // Defensive: ensure models is always an array
  const safeEntry = { ...entry, models: entry.models ?? [] }
  const testStatus = entry.testStatus ?? 'untested'

  const runTest = useCallback(async (updatedEntry?: ProviderEntry) => {
    setTesting(true)
    setTestError('')
    try {
      const result = await services.settings.testProvider(providerKey)
      if (result.ok) {
        setTestLatency(result.latencyMs ?? 0)
        await onUpdate({ ...(updatedEntry ?? entry), testStatus: 'ok' })
      } else {
        setTestError(result.error ?? 'Unknown error')
        await onUpdate({ ...(updatedEntry ?? entry), testStatus: 'error' })
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test failed')
      await onUpdate({ ...(updatedEntry ?? entry), testStatus: 'error' })
    } finally {
      setTesting(false)
    }
  }, [services, providerKey, entry, onUpdate])

  async function handleSave() {
    const updated: ProviderEntry = {
      ...entry,
      name,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
    }
    await onUpdate(updated)
    setEditing(false)
    // Auto-test if credentials are present
    if (updated.apiKey || isLocalUrl(updated.baseUrl)) {
      await runTest(updated)
    }
  }

  function handleCancelEdit() {
    setApiKey(entry.apiKey ?? '')
    setBaseUrl(entry.baseUrl ?? '')
    setName(entry.name)
    setEditing(false)
  }

  async function handleAddModel() {
    const model = newModel.trim()
    if (!model || safeEntry.models.includes(model)) return
    await onUpdate({ ...entry, models: [...safeEntry.models, model] })
    setNewModel('')
  }

  async function handleRemoveModel(model: string) {
    await onUpdate({ ...entry, models: safeEntry.models.filter(m => m !== model) })
  }

  const maskedKey = entry.apiKey
    ? entry.apiKey.slice(0, 7) + '\u2022'.repeat(8)
    : ''

  return (
    <PixelCard>
      {/* Header row */}
      <div className="flex items-center gap-3">
        <span className="font-pixel text-[11px] text-text-primary">{entry.name}</span>
        <span className="text-[9px] text-text-dim font-mono">({providerKey})</span>
        {/* Status indicator */}
        {testing ? (
          <span className="text-[10px] text-accent-blue animate-pulse">Testing...</span>
        ) : testStatus === 'ok' ? (
          <span className="text-[10px] text-accent-green">{'\u2705'} OK{testLatency > 0 ? ` (${testLatency}ms)` : ''}</span>
        ) : testStatus === 'error' ? (
          <span className="text-[10px] text-accent-red">{'\u274C'} Failed</span>
        ) : hasCredentials(safeEntry) ? (
          <span className="text-[10px] text-accent-amber">Untested</span>
        ) : (
          <span className="text-[10px] text-text-dim">{'\u26AA'} No Key</span>
        )}
        {/* Test button (only when has credentials and not editing) */}
        {hasCredentials(safeEntry) && !editing && !testing && (
          <PixelButton size="sm" variant="ghost" onClick={() => runTest()}>
            {testStatus === 'ok' ? 'Re-test' : 'Test'}
          </PixelButton>
        )}
        <div className="ml-auto flex gap-1">
          {!editing ? (
            <>
              <PixelButton size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</PixelButton>
              <PixelButton size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>Del</PixelButton>
            </>
          ) : (
            <>
              <PixelButton size="sm" variant="ghost" onClick={handleCancelEdit}>Cancel</PixelButton>
              <PixelButton size="sm" variant="primary" onClick={handleSave}>Save</PixelButton>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-2 p-2 bg-accent-red/10 border-2 border-accent-red/30 flex items-center gap-3">
          <span className="text-[11px] text-accent-red flex-1">
            Delete <strong>{entry.name}</strong>? This cannot be undone.
          </span>
          <PixelButton size="sm" variant="danger" onClick={() => { setConfirmDelete(false); onDelete() }}>
            Confirm
          </PixelButton>
          <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </PixelButton>
        </div>
      )}

      {/* Test error details */}
      {!testing && testStatus === 'error' && testError && (
        <div className="mt-2 p-2 bg-accent-red/10 border-2 border-accent-red/30">
          <span className="text-[10px] text-accent-red font-mono break-all">{testError}</span>
        </div>
      )}

      {/* Edit mode */}
      {editing ? (
        <div className="flex flex-col gap-3 mt-3">
          <PixelInput
            label="NAME"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <PixelInput
            label="API KEY"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide Key' : 'Show Key'}
          </PixelButton>
          <PixelInput
            label="BASE URL (optional)"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      ) : (
        <div className="mt-2">
          {/* API Key display */}
          <div className="flex items-center gap-2">
            <label className="font-pixel text-[8px] text-text-dim">API Key:</label>
            {entry.apiKey ? (
              <span className="text-[11px] text-text-secondary font-mono">
                {showKey ? entry.apiKey : maskedKey}
              </span>
            ) : (
              <span className="text-[11px] text-text-dim italic">not set</span>
            )}
            {entry.apiKey && (
              <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                {showKey ? 'Hide' : 'Show'}
              </PixelButton>
            )}
          </div>
          {/* Base URL display */}
          {entry.baseUrl && (
            <div className="flex items-center gap-2 mt-1">
              <label className="font-pixel text-[8px] text-text-dim">URL:</label>
              <span className="text-[11px] text-text-secondary font-mono">{entry.baseUrl}</span>
            </div>
          )}
        </div>
      )}

      {/* Models section (collapsible) */}
      <div className="mt-3 border-t-2 border-border-dim pt-2">
        <button
          onClick={() => setModelsExpanded(!modelsExpanded)}
          className="flex items-center gap-2 cursor-pointer w-full text-left"
        >
          <span className="text-[10px] text-text-dim">{modelsExpanded ? '\u25BE' : '\u25B8'}</span>
          <span className="font-pixel text-[9px] text-text-secondary">
            Models ({safeEntry.models.length})
          </span>
          {!modelsExpanded && safeEntry.models.length > 0 && (
            <span className="text-[10px] text-text-dim font-mono truncate">
              {safeEntry.models.join(', ')}
            </span>
          )}
        </button>

        {modelsExpanded && (
          <div className="mt-2 flex flex-col gap-1">
            {safeEntry.models.map(model => (
              <div key={model} className="flex items-center gap-2 px-2 py-1 bg-deep">
                <span className="text-[11px] text-text-primary font-mono flex-1">{model}</span>
                <button
                  onClick={() => handleRemoveModel(model)}
                  className="text-[10px] text-accent-red hover:text-text-primary cursor-pointer px-1"
                >
                  ×
                </button>
              </div>
            ))}
            {/* Add model */}
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={newModel}
                onChange={e => setNewModel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddModel() }}
                placeholder="model-id"
                className="flex-1 h-7 bg-deep px-2 text-[11px] text-text-primary font-mono border-2 border-border-dim outline-none focus:border-accent-blue"
              />
              <PixelButton size="sm" variant="ghost" onClick={handleAddModel}>+ Add Model</PixelButton>
            </div>
          </div>
        )}
      </div>
    </PixelCard>
  )
}

// ========== General Tab ==========
function GeneralTab() {
  const themeMode = useAppStore(s => s.themeMode)
  const setTheme = useAppStore(s => s.setTheme)
  const updateSettings = useAppStore(s => s.updateSettings)

  async function handleThemeChange(mode: ThemeMode) {
    setTheme(mode)
    await updateSettings({ theme: mode })
  }

  const themes: { mode: ThemeMode; label: string; bgPreview: string; surfPreview: string; textPreview: string }[] = [
    { mode: 'light', label: 'Light', bgPreview: 'bg-[#F5F3EE]', surfPreview: 'bg-[#DEDBD4]', textPreview: 'bg-[#1A1612]' },
    { mode: 'dark', label: 'Dark', bgPreview: 'bg-[#0B0E14]', surfPreview: 'bg-[#1E2430]', textPreview: 'bg-[#E8ECF1]' },
    { mode: 'system', label: 'System', bgPreview: 'bg-gradient-to-r from-[#F5F3EE] to-[#0B0E14]', surfPreview: 'bg-gradient-to-r from-[#DEDBD4] to-[#1E2430]', textPreview: 'bg-gradient-to-r from-[#1A1612] to-[#E8ECF1]' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">APPEARANCE</div>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(t => {
            const isActive = themeMode === t.mode
            return (
              <button
                key={t.mode}
                onClick={() => handleThemeChange(t.mode)}
                className={`p-3 border-2 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-elevated border-accent-green'
                    : 'bg-deep border-border-dim hover:border-border-bright'
                }`}
              >
                {/* Mini preview */}
                <div className={`w-full h-12 ${t.bgPreview} border border-border-dim mb-2 p-1.5 flex flex-col justify-between`}>
                  <div className={`h-1.5 w-3/4 ${t.surfPreview}`} />
                  <div className={`h-1 w-1/2 ${t.textPreview}`} />
                  <div className={`h-1 w-2/3 ${t.textPreview} opacity-50`} />
                </div>
                <div className={`text-[10px] text-center ${isActive ? 'text-accent-green' : 'text-text-secondary'}`}>
                  {t.label}
                </div>
              </button>
            )
          })}
        </div>
      </PixelCard>
    </div>
  )
}
