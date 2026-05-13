import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle, useTabParam } from '../../hooks'
import type { ProviderSdkType, ProviderEntry, ThemeMode, StyleTheme, GlobalSettings, AgentModelConfig, OAuthFlowStatus } from '@golemancy/shared'
import { AnalyticsEvents } from '@golemancy/shared'
import { trackEvent } from '../../lib/analytics'
import { useAppStore } from '../../stores'
import { useServices } from '../../hooks'
import { PixelCard, PixelButton, PixelInput, PixelTabs } from '../../components'
import { PixelDropdown } from '../../components/base/PixelDropdown'
import { GlobalLayout } from '../../app/layouts/GlobalLayout'
import { SpeechTab } from './SpeechTab'
import { PROVIDER_PRESETS } from '../../lib/provider-presets'
import { LANGUAGES } from '../../i18n/languages'
import { AnimatePresence, motion } from 'motion/react'

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

/** Whether the provider has credentials (API key, localhost, or OAuth) */
function hasCredentials(entry: ProviderEntry): boolean {
  return !!(entry.apiKey || isLocalUrl(entry.baseUrl) || entry.oauth?.accessToken)
}

/** Whether the provider is available for selection (test passed — server persists testStatus on OAuth connect) */
function isProviderAvailable(entry: ProviderEntry): boolean {
  return entry.testStatus === 'ok'
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function BadgeDot() {
  return <span className="inline-block w-2 h-2 bg-accent-green ml-1.5" />
}

const VALID_TABS = ['general', 'providers', 'speech', 'about'] as const

export function GlobalSettingsPage() {
  useDocumentTitle('Settings – Golemancy')
  const settings = useAppStore(s => s.settings)

  if (!settings) return null

  return (
    <GlobalLayout>
      <GlobalSettingsContent />
    </GlobalLayout>
  )
}

interface GlobalSettingsContentProps {
  showPageTitle?: boolean
  containerClassName?: string
}

export function GlobalSettingsContent({
  showPageTitle = true,
  containerClassName = 'max-w-[1000px] mx-auto p-8',
}: GlobalSettingsContentProps = {}) {
  const { t } = useTranslation('settings')
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)

  const [activeTab, handleTabChange] = useTabParam(VALID_TABS)

  const updateState = useAppStore(s => s.updateState)
  const notificationsEnabled = useAppStore(s => s.updateNotificationsEnabled)
  const showBadge = updateState != null
    && (updateState.status === 'downloaded' || updateState.status === 'available')
    && notificationsEnabled

  if (!settings) return null

  const SETTINGS_TABS: { id: string; label: ReactNode }[] = [
    { id: 'general', label: t('tabs.general') },
    { id: 'providers', label: t('tabs.providers') },
    { id: 'speech', label: t('tabs.speech') },
    { id: 'about', label: <>{t('tabs.about')}{showBadge && <BadgeDot />}</> },
  ]

  return (
    <div data-testid="settings-form" className={containerClassName}>
      {showPageTitle && (
        <h2 className="mb-6 font-pixel text-[12px] text-text-primary">{t('page.title')}</h2>
      )}

      <PixelTabs tabs={SETTINGS_TABS} activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="mt-4">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'providers' && (
          <ProvidersTab settings={settings} onUpdate={updateSettings} />
        )}
        {activeTab === 'speech' && <SpeechTab />}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}

// ========== Add Mode Type ==========
type AddMode =
  | false
  | 'select'
  | { type: 'preset'; key: string }
  | { type: 'custom' }
  | { type: 'oauth'; key: string }

// ========== Providers Tab ==========
function ProvidersTab({ settings, onUpdate }: {
  settings: GlobalSettings
  onUpdate: (data: Partial<GlobalSettings>) => Promise<void>
}) {
  const { t } = useTranslation('settings')
  const [addMode, setAddMode] = useState<AddMode>(false)

  // Defensive: providers may be undefined or old array format from v1 data
  const providers = (settings.providers && !Array.isArray(settings.providers)) ? settings.providers : {}
  const providerKeys = Object.keys(providers)

  // Available providers (test passed)
  const availableProviders = Object.entries(providers).filter(
    ([, entry]) => isProviderAvailable(entry),
  )

  // Presets not yet added
  const remainingPresets = Object.entries(PROVIDER_PRESETS).filter(([key]) => !providers[key])

  function handlePresetClick(key: string) {
    const preset = PROVIDER_PRESETS[key]
    if (!preset) return
    if (preset.oauthConfig) {
      setAddMode({ type: 'oauth', key })
    } else {
      setAddMode({ type: 'preset', key })
    }
  }

  async function handleSaveProvider(key: string, entry: ProviderEntry) {
    const patch: Partial<GlobalSettings> = { providers: { ...providers, [key]: entry } }
    // Auto-set default model when a provider first becomes available and no default is configured
    if (entry.testStatus === 'ok' && !settings.defaultModel && entry.models.length > 0) {
      patch.defaultModel = { provider: key, model: entry.models[0] }
    }
    await onUpdate(patch)
    setAddMode('select')
  }

  async function handleDeleteProvider(key: string) {
    const updated = { ...providers }
    delete updated[key]
    const patch: Partial<GlobalSettings> = { providers: updated }
    // If the deleted provider was the default model's provider, auto-switch to the next available one
    if (settings.defaultModel?.provider === key) {
      const next = Object.entries(updated).find(
        ([, e]) => e.testStatus === 'ok' && e.models.length > 0,
      )
      patch.defaultModel = next
        ? { provider: next[0], model: next[1].models[0] }
        : undefined
    }
    await onUpdate(patch)
  }

  async function handleUpdateProvider(key: string, entry: ProviderEntry) {
    const patch: Partial<GlobalSettings> = { providers: { ...providers, [key]: entry } }

    // Auto-set default model when a provider first becomes available and no default is configured
    const prevEntry = providers[key]
    if (
      entry.testStatus === 'ok'
      && prevEntry?.testStatus !== 'ok'
      && !settings.defaultModel
      && entry.models.length > 0
    ) {
      patch.defaultModel = { provider: key, model: entry.models[0] }
    }

    await onUpdate(patch)
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
        <div className="font-pixel text-[10px] text-text-secondary">{t('providers.sectionTitle')}</div>
        <PixelButton size="sm" variant="primary" onClick={() => setAddMode(addMode ? false : 'select')}>
          {addMode ? t('common:button.cancel') : t('providers.addProvider')}
        </PixelButton>
      </div>

      {/* Add Provider Panel — animates between grid and form */}
      <AnimatePresence mode="wait">
        {addMode === 'select' && (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <PixelCard variant="outlined">
              <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('providers.selectProvider')}</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {remainingPresets.map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => handlePresetClick(key)}
                    className={`p-3 border-2 cursor-pointer transition-colors text-left ${
                      preset.oauthConfig
                        ? 'border-[rgba(123,143,168,0.45)] bg-gradient-to-br from-deep to-[rgba(107,203,119,0.03)] hover:border-[rgba(123,143,168,0.7)]'
                        : 'border-border-dim bg-deep hover:border-border-bright'
                    }`}
                  >
                    <div className="text-[11px] text-text-primary">{preset.name}</div>
                    {preset.oauthConfig ? (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        <span className="font-pixel text-[7px] text-[#7B8FA8] bg-[rgba(123,143,168,0.1)] border border-[rgba(123,143,168,0.3)] px-1.5 py-0.5 tracking-wide">OAUTH</span>
                        <span className="font-pixel text-[7px] text-accent-green bg-accent-green/10 border border-accent-green/30 px-1.5 py-0.5 tracking-wide">{t('provider.oauthNoApiFees')}</span>
                      </div>
                    ) : (
                      <div className="text-[9px] text-text-dim mt-1">{preset.sdkType}</div>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setAddMode({ type: 'custom' })}
                  className="p-3 border-2 border-border-dim border-dashed bg-deep hover:border-border-bright cursor-pointer transition-colors text-left"
                >
                  <div className="text-[11px] text-text-primary">{t('providers.custom')}</div>
                  <div className="text-[9px] text-text-dim mt-1">{t('providers.anyEndpoint')}</div>
                </button>
              </div>
            </PixelCard>
          </motion.div>
        )}
        {typeof addMode === 'object' && (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ProviderAddForm
              mode={addMode}
              providers={providers}
              onSave={handleSaveProvider}
              onCancel={() => setAddMode('select')}
              onUpdate={onUpdate}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider Cards */}
      {providerKeys.length === 0 && !addMode ? (
        <PixelCard variant="outlined" className="text-center py-6">
          <p className="text-[12px] text-text-dim">{t('providers.empty')}</p>
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
  const { t } = useTranslation('settings')
  const [autoSwitched, setAutoSwitched] = useState(false)
  const prevProviderRef = useRef(defaultModel?.provider)

  // Sync local state when defaultModel changes externally
  useEffect(() => {
    const prev = prevProviderRef.current
    const next = defaultModel?.provider ?? ''
    prevProviderRef.current = next

    // Detect auto-switch: provider changed and the previous one is gone
    if (prev && next && prev !== next && !availableProviders.some(([slug]) => slug === prev)) {
      setAutoSwitched(true)
    }
  }, [defaultModel?.provider, defaultModel?.model])

  const provider = defaultModel?.provider ?? ''
  const model = defaultModel?.model ?? ''
  const selectedEntry = providers[provider]
  const models = selectedEntry?.models ?? []
  const disabled = availableProviders.length === 0

  // Orphaned: defaultModel references a provider that is not available
  const isOrphaned = !!defaultModel?.provider
    && !availableProviders.some(([slug]) => slug === defaultModel.provider)

  const hasWarning = isOrphaned || autoSwitched

  function handleProviderChange(slug: string) {
    const entry = providers[slug]
    const firstModel = entry?.models[0]
    if (slug && firstModel) {
      onChange({ provider: slug, model: firstModel })
    }
    setAutoSwitched(false)
  }

  function handleModelChange(m: string) {
    if (provider && m) {
      onChange({ provider, model: m })
    }
    setAutoSwitched(false)
  }

  const warningMessage = isOrphaned
    ? t('defaultModel.orphaned')
    : autoSwitched
      ? t('defaultModel.autoSwitched')
      : null

  return (
    <PixelCard className={hasWarning ? 'border-accent-amber bg-accent-amber/5' : undefined}>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-pixel text-[10px] text-text-secondary">{t('defaultModel.sectionTitle')}</div>
        {hasWarning && (
          <span className="font-pixel text-[7px] text-accent-amber bg-accent-amber/15 border border-accent-amber/40 px-1.5 py-0.5 tracking-wide">CHANGED</span>
        )}
      </div>
      {warningMessage ? (
        <div className="flex items-start gap-2 mb-3">
          <span className="text-accent-amber shrink-0 mt-px">{'\u26A0'}</span>
          <p className="text-[11px] text-text-secondary">{warningMessage}</p>
        </div>
      ) : (
        <p className="text-[11px] text-text-dim mb-3">{t('defaultModel.description')}</p>
      )}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('defaultModel.providerLabel')}</label>
          <select
            value={provider}
            onChange={e => handleProviderChange(e.target.value)}
            disabled={disabled}
            className={`h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-sunken outline-none focus:border-accent-blue ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {disabled && <option value="">{t('defaultModel.noProvider')}</option>}
            {availableProviders.map(([slug, entry]) => (
              <option key={slug} value={slug}>{entry.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">{t('defaultModel.modelLabel')}</label>
          <select
            value={model}
            onChange={e => handleModelChange(e.target.value)}
            disabled={disabled}
            className={`h-9 bg-deep px-3 font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-sunken outline-none focus:border-accent-blue ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {disabled && <option value="">{t('defaultModel.selectProviderFirst')}</option>}
            {!disabled && models.length === 0 && <option value="">{t('defaultModel.noModels')}</option>}
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
    </PixelCard>
  )
}

// ========== Provider Add Form (in-place transform) ==========
function ProviderAddForm({ mode, providers, onSave, onCancel, onUpdate }: {
  mode: { type: 'preset'; key: string } | { type: 'custom' } | { type: 'oauth'; key: string }
  providers: Record<string, ProviderEntry>
  onSave: (key: string, entry: ProviderEntry) => Promise<void>
  onCancel: () => void
  onUpdate: (data: Partial<GlobalSettings>) => Promise<void>
}) {
  const { t } = useTranslation('settings')
  const services = useServices()

  const preset = mode.type !== 'custom' ? PROVIDER_PRESETS[mode.key] : undefined

  // Form state
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(preset?.defaultBaseUrl ?? '')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  // Custom-specific state
  const [customName, setCustomName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customSdkType, setCustomSdkType] = useState<ProviderSdkType>('openai-compatible')
  const [customModels, setCustomModels] = useState<string[]>([])
  const [newModel, setNewModel] = useState('')
  // OAuth state
  const [oauthStatus, setOauthStatus] = useState<OAuthFlowStatus>('idle')
  const [oauthError, setOauthError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const buildEntry = useCallback((): { slug: string; entry: ProviderEntry } => {
    if (mode.type === 'custom') {
      const name = customName.trim()
      const slug = slugify(name) || 'custom'
      let finalSlug = slug
      if (providers[finalSlug]) {
        let i = 2
        while (providers[`${slug}-${i}`]) i++
        finalSlug = `${slug}-${i}`
      }
      return {
        slug: finalSlug,
        entry: {
          name,
          sdkType: customSdkType,
          models: customModels,
          apiKey: apiKey || undefined,
          baseUrl: customBaseUrl.trim() || undefined,
        },
      }
    }
    // Preset or OAuth
    return {
      slug: mode.key,
      entry: {
        name: preset!.name,
        sdkType: preset!.sdkType,
        models: [...preset!.defaultModels],
        apiKey: apiKey || undefined,
        baseUrl: baseUrl.trim() || preset!.defaultBaseUrl,
        ...(preset!.oauthConfig ? { oauthConfig: preset!.oauthConfig } : {}),
      },
    }
  }, [mode, preset, apiKey, baseUrl, customName, customBaseUrl, customSdkType, customModels, providers])

  async function handleTestAndSave() {
    const { slug, entry } = buildEntry()
    setTesting(true)
    setTestError('')
    try {
      const result = await services.settings.testProviderConfig!(entry)
      if (result.ok) {
        await onSave(slug, { ...entry, testStatus: 'ok' })
        trackEvent(AnalyticsEvents.PROVIDER_TESTED, { provider: slug })
      } else {
        setTestError(result.error ?? t('provider.failed'))
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : t('provider.failed'))
    } finally {
      setTesting(false)
    }
  }

  function handleAddModel() {
    const model = newModel.trim()
    if (!model || customModels.includes(model)) return
    setCustomModels([...customModels, model])
    setNewModel('')
  }

  function handleRemoveModel(model: string) {
    setCustomModels(customModels.filter(m => m !== model))
  }

  // OAuth flow
  const startOAuthFlow = useCallback(async () => {
    if (!services.settings.startOAuthFlow || !preset) return
    // Must save provider entry first (oauthManager reads from settings)
    const { slug, entry } = buildEntry()
    await onUpdate({ providers: { ...providers, [slug]: entry } })
    setOauthStatus('pending')
    setOauthError('')
    try {
      const { authUrl } = await services.settings.startOAuthFlow(slug)
      if (window.electronAPI?.openExternalUrl) {
        await window.electronAPI.openExternalUrl(authUrl)
      } else {
        window.open(authUrl, '_blank')
      }
      pollRef.current = setInterval(async () => {
        try {
          const flowState = await services.settings.getOAuthFlowStatus!(slug)
          if (flowState.status === 'success') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setOauthStatus('success')
            const fresh = await services.settings.get()
            const freshEntry = fresh.providers[slug]
            if (freshEntry) {
              await onSave(slug, { ...freshEntry, testStatus: 'ok' })
            }
          } else if (flowState.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setOauthStatus('error')
            setOauthError(flowState.error ?? t('provider.oauthError'))
          }
        } catch {
          // Polling error — ignore
        }
      }, 2000)
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setOauthStatus('error')
          setOauthError('Authentication timed out')
        }
      }, 5 * 60 * 1000)
    } catch (err) {
      setOauthStatus('error')
      setOauthError(err instanceof Error ? err.message : String(err))
    }
  }, [services, preset, buildEntry, providers, onUpdate, onSave, t])

  const cancelOAuth = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setOauthStatus('idle')
    setOauthError('')
    // Delete temporarily saved provider entry
    if (mode.type === 'oauth') {
      const { [mode.key]: _, ...rest } = providers
      await onUpdate({ providers: rest })
      try {
        await services.settings.cancelOAuthFlow?.(mode.key)
      } catch { /* ignore */ }
    }
    onCancel()
  }, [services, mode, providers, onUpdate, onCancel])

  const canTestPreset = !!apiKey || isLocalUrl(baseUrl)
  const canTestCustom = !!customName.trim() && customModels.length > 0 && (!!apiKey || isLocalUrl(customBaseUrl))

  // --- Preset / Custom form ---
  if (mode.type === 'preset' || mode.type === 'custom') {
    const title = mode.type === 'preset'
      ? t('providers.configureProvider', { name: preset!.name })
      : t('providers.configureCustom')

    return (
      <PixelCard variant="outlined">
        <div className="font-pixel text-[10px] text-text-secondary mb-3">{title}</div>
        <div className="flex flex-col gap-3">
          {/* Custom-only: name, sdk type */}
          {mode.type === 'custom' && (
            <>
              <PixelInput
                label={t('providers.nameLabel')}
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder={t('providers.customPlaceholder')}
              />
              <div>
                <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('providers.sdkTypeLabel')}</label>
                <select
                  value={customSdkType}
                  onChange={e => setCustomSdkType(e.target.value as ProviderSdkType)}
                  className="w-full h-9 bg-deep px-3 text-[12px] text-text-primary font-mono border-2 border-border-dim shadow-sunken focus:border-accent-blue outline-none"
                >
                  {SDK_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* API Key */}
          <div>
            <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('providers.apiKeyRequired')}</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 h-9 bg-deep px-3 text-[12px] text-text-primary font-mono border-2 border-border-dim shadow-sunken focus:border-accent-blue outline-none"
              />
              <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                {showKey ? t('provider.hideKey') : t('provider.showKey')}
              </PixelButton>
            </div>
          </div>

          {/* Base URL */}
          <PixelInput
            label={mode.type === 'custom' ? t('providers.baseUrlLabel') : t('provider.baseUrlOptional')}
            value={mode.type === 'custom' ? customBaseUrl : baseUrl}
            onChange={e => mode.type === 'custom' ? setCustomBaseUrl(e.target.value) : setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />

          {/* Custom-only: models */}
          {mode.type === 'custom' && (
            <div>
              <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('providers.modelsRequired')}</label>
              {customModels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {customModels.map(m => (
                    <span key={m} className="inline-flex items-center gap-1 bg-deep border border-border-dim px-2 py-0.5 text-[11px] font-mono text-text-secondary">
                      {m}
                      <button onClick={() => handleRemoveModel(m)} className="text-text-dim hover:text-accent-red cursor-pointer">&times;</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newModel}
                  onChange={e => setNewModel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddModel()}
                  placeholder="model-name"
                  className="flex-1 h-8 bg-deep px-3 text-[11px] text-text-primary font-mono border-2 border-border-dim shadow-sunken focus:border-accent-blue outline-none"
                />
                <PixelButton size="sm" variant="ghost" onClick={handleAddModel}>{t('provider.addModel')}</PixelButton>
              </div>
            </div>
          )}

          {/* Preset: show pre-filled models as read-only chips */}
          {mode.type === 'preset' && preset && (
            <div>
              <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('provider.modelsCount', { count: preset.defaultModels.length })}</label>
              <div className="flex flex-wrap gap-1.5">
                {preset.defaultModels.map(m => (
                  <span key={m} className="bg-deep border border-border-dim px-2 py-0.5 text-[11px] font-mono text-text-secondary">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {testError && (
            <div className="bg-accent-red/10 border border-accent-red/30 p-2 text-[11px] text-accent-red font-mono break-all">{testError}</div>
          )}

          {/* Actions */}
          <div className="flex gap-2 items-center">
            <PixelButton
              size="sm"
              variant="primary"
              onClick={handleTestAndSave}
              disabled={testing || (mode.type === 'preset' ? !canTestPreset : !canTestCustom)}
            >
              {testing ? t('providers.testingConnection') : t('providers.testAndSave')}
            </PixelButton>
            <PixelButton size="sm" variant="ghost" onClick={onCancel}>
              {mode.type === 'custom' ? t('common:button.back') : t('common:button.cancel')}
            </PixelButton>
          </div>
        </div>
      </PixelCard>
    )
  }

  // --- OAuth form ---
  return (
    <PixelCard variant="outlined" className="border-[rgba(123,143,168,0.35)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-pixel text-[10px] text-text-secondary">{t('providers.configureProvider', { name: preset!.name })}</span>
        <span className="font-pixel text-[7px] text-[#7B8FA8] bg-[rgba(123,143,168,0.1)] border border-[rgba(123,143,168,0.3)] px-1.5 py-0.5 tracking-wide">OAUTH</span>
        <span className="font-pixel text-[7px] text-accent-green bg-accent-green/10 border border-accent-green/30 px-1.5 py-0.5 tracking-wide">{t('provider.oauthNoApiFees')}</span>
      </div>

      {oauthStatus === 'idle' && (
        <div className="flex flex-col gap-3">
          <button
            onClick={startOAuthFlow}
            className="w-full p-3 border-2 border-accent-green/40 bg-gradient-to-r from-accent-green/5 to-accent-green/10 hover:border-accent-green/70 cursor-pointer transition-colors text-center"
          >
            <span className="text-[12px] text-accent-green font-pixel">{t('provider.oauthSignIn', { provider: preset!.name })}</span>
          </button>
          <p className="text-[10px] text-text-dim">{t('provider.oauthSubscriptionHint')}</p>
          <PixelButton size="sm" variant="ghost" onClick={onCancel}>{t('common:button.cancel')}</PixelButton>
        </div>
      )}

      {oauthStatus === 'pending' && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-accent-amber animate-pulse">{t('provider.oauthPending')}</p>
          <p className="text-[10px] text-text-dim">{t('provider.oauthPendingHint')}</p>
          <PixelButton size="sm" variant="ghost" onClick={cancelOAuth}>{t('provider.oauthCancel')}</PixelButton>
        </div>
      )}

      {oauthStatus === 'error' && (
        <div className="flex flex-col gap-2">
          <div className="bg-accent-red/10 border border-accent-red/30 p-2 text-[11px] text-accent-red font-mono">{oauthError}</div>
          <div className="flex gap-2">
            <PixelButton size="sm" variant="primary" onClick={startOAuthFlow}>{t('common:button.retry')}</PixelButton>
            <PixelButton size="sm" variant="ghost" onClick={cancelOAuth}>{t('common:button.cancel')}</PixelButton>
          </div>
        </div>
      )}
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
  const { t } = useTranslation('settings')
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
        trackEvent(AnalyticsEvents.PROVIDER_TESTED, { provider: providerKey })
      } else {
        setTestError(result.error ?? t('provider.failed'))
        await onUpdate({ ...(updatedEntry ?? entry), testStatus: 'error' })
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : t('provider.failed'))
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

  // --- OAuth state ---
  const isOAuth = !!entry.oauthConfig
  const isOAuthConnected = !!(entry.oauth?.accessToken)
  const [oauthStatus, setOauthStatus] = useState<OAuthFlowStatus>('idle')
  const [oauthError, setOauthError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const startOAuthFlow = useCallback(async () => {
    if (!services.settings.startOAuthFlow) return
    setOauthStatus('pending')
    setOauthError('')
    try {
      const { authUrl } = await services.settings.startOAuthFlow(providerKey)
      // Open browser
      if (window.electronAPI?.openExternalUrl) {
        await window.electronAPI.openExternalUrl(authUrl)
      } else {
        window.open(authUrl, '_blank')
      }
      // Start polling for completion
      pollRef.current = setInterval(async () => {
        try {
          const flowState = await services.settings.getOAuthFlowStatus!(providerKey)
          if (flowState.status === 'success') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setOauthStatus('success')
            // Refresh settings to get new tokens
            const fresh = await services.settings.get()
            const freshEntry = fresh.providers[providerKey]
            if (freshEntry) {
              // Mark as ok — OAuth token exchange already validated credentials
              await onUpdate({ ...freshEntry, testStatus: 'ok' })
            }
          } else if (flowState.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setOauthStatus('error')
            setOauthError(flowState.error ?? t('provider.oauthError'))
          }
        } catch {
          // Polling error — ignore
        }
      }, 2000)
      // Stop polling after 5 minutes
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setOauthStatus('error')
          setOauthError('Authentication timed out')
        }
      }, 5 * 60 * 1000)
    } catch (err) {
      setOauthStatus('error')
      setOauthError(err instanceof Error ? err.message : String(err))
    }
  }, [services, providerKey, onUpdate, runTest]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelOAuthFlow = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setOauthStatus('idle')
    setOauthError('')
    try {
      await services.settings.cancelOAuthFlow?.(providerKey)
    } catch {
      // ignore
    }
  }, [services, providerKey])

  const disconnectOAuth = useCallback(async () => {
    try {
      await services.settings.disconnectOAuth?.(providerKey)
      // Refresh settings
      const fresh = await services.settings.get()
      const freshEntry = fresh.providers[providerKey]
      if (freshEntry) await onUpdate(freshEntry)
      setOauthStatus('idle')
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : String(err))
    }
  }, [services, providerKey, onUpdate])

  // Token expiry calculation
  const tokenExpiryMinutes = entry.oauth?.expiresAt
    ? Math.max(0, Math.round((new Date(entry.oauth.expiresAt).getTime() - Date.now()) / 60000))
    : 0

  const maskedKey = entry.apiKey
    ? entry.apiKey.slice(0, 7) + '\u2022'.repeat(8)
    : ''

  return (
    <PixelCard className={isOAuth ? 'border-[rgba(123,143,168,0.35)]' : undefined}>
      {/* Header row */}
      <div className="flex items-center gap-3">
        <span className="font-pixel text-[11px] text-text-primary">{entry.name}</span>
        <span className="text-[9px] text-text-dim font-mono">({providerKey})</span>
        {/* OAuth badges */}
        {isOAuth && (
          <>
            <span className="font-pixel text-[7px] text-[#7B8FA8] bg-[rgba(123,143,168,0.1)] border border-[rgba(123,143,168,0.3)] px-1.5 py-0.5 tracking-wide">OAUTH</span>
            {(isOAuthConnected || oauthStatus !== 'pending') && (
              <span className="font-pixel text-[7px] text-accent-green bg-accent-green/10 border border-accent-green/30 px-1.5 py-0.5 tracking-wide">{t('provider.oauthNoApiFees')}</span>
            )}
          </>
        )}
        {/* Status indicator — OAuth connected overrides test status */}
        {isOAuth && isOAuthConnected ? (
          <span className="text-[10px] text-accent-green">{'\u2705'} {t('provider.ok')}</span>
        ) : testing ? (
          <span className="text-[10px] text-accent-blue animate-pulse">{t('provider.testing')}</span>
        ) : testStatus === 'ok' ? (
          <span className="text-[10px] text-accent-green">{'\u2705'} {testLatency > 0 ? t('provider.okLatency', { latency: testLatency }) : t('provider.ok')}</span>
        ) : testStatus === 'error' ? (
          <span className="text-[10px] text-accent-red">{'\u274C'} {t('provider.failed')}</span>
        ) : hasCredentials(safeEntry) ? (
          <span className="text-[10px] text-accent-amber">{t('provider.untested')}</span>
        ) : isOAuth ? null : (
          <span className="text-[10px] text-text-dim">{'\u26AA'} {t('provider.noKey')}</span>
        )}
        {/* Test button (only when has credentials and not editing; hidden for connected OAuth providers) */}
        {hasCredentials(safeEntry) && !editing && !testing && !(isOAuth && isOAuthConnected) && (
          <PixelButton size="sm" variant="ghost" onClick={() => runTest()}>
            {testStatus === 'ok' ? t('provider.retest') : t('provider.test')}
          </PixelButton>
        )}
        <div className="ml-auto flex gap-1">
          {!editing ? (
            <>
              <PixelButton size="sm" variant="ghost" onClick={() => setEditing(true)}>{t('common:button.edit')}</PixelButton>
              <PixelButton size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>{t('provider.del')}</PixelButton>
            </>
          ) : (
            <>
              <PixelButton size="sm" variant="ghost" onClick={handleCancelEdit}>{t('common:button.cancel')}</PixelButton>
              <PixelButton size="sm" variant="primary" onClick={handleSave}>{t('common:button.save')}</PixelButton>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-2 p-2 bg-accent-red/10 border-2 border-accent-red/30 flex items-center gap-3">
          <span className="text-[11px] text-accent-red flex-1">
            {t('provider.deleteConfirm', { name: entry.name })}
          </span>
          <PixelButton size="sm" variant="danger" onClick={() => { setConfirmDelete(false); onDelete() }}>
            {t('common:button.confirm')}
          </PixelButton>
          <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            {t('common:button.cancel')}
          </PixelButton>
        </div>
      )}

      {/* Test error details */}
      {!testing && testStatus === 'error' && testError && (
        <div className="mt-2 p-2 bg-accent-red/10 border-2 border-accent-red/30">
          <span className="text-[10px] text-accent-red font-mono break-all">{testError}</span>
        </div>
      )}

      {/* OAuth section */}
      {isOAuth && !editing && (
        <div className={`mt-3 p-3.5 bg-deep border-2 ${
          oauthStatus === 'pending' ? 'border-accent-amber' :
          oauthStatus === 'error' ? 'border-accent-red' :
          isOAuthConnected ? 'border-accent-green' :
          'border-border-dim'
        }`}>
          <div className="flex items-center gap-2 font-pixel text-[9px] text-text-secondary mb-2.5">
            {t('provider.oauthSectionTitle')}
            {isOAuthConnected && (
              <span className="font-mono text-[9px] text-accent-green bg-accent-green/15 px-1.5 py-0.5">{t('provider.oauthActive')}</span>
            )}
          </div>

          {/* Not connected */}
          {!isOAuthConnected && oauthStatus === 'idle' && (
            <>
              <button
                onClick={startOAuthFlow}
                className="w-full py-2.5 px-5 border-2 border-accent-green bg-gradient-to-br from-[#1a3a1a] to-[#0d2a0d] text-accent-green font-mono text-[13px] font-semibold cursor-pointer hover:from-[#1f4a1f] hover:to-[#0f350f] hover:shadow-[0_0_12px_rgba(107,203,119,0.2)] transition-all tracking-wide"
              >
                {t('provider.oauthSignIn', { provider: entry.name })}
              </button>
              <p className="text-[9px] text-text-dim mt-2 leading-relaxed">{t('provider.oauthSubscriptionHint')}</p>
            </>
          )}

          {/* Pending */}
          {oauthStatus === 'pending' && (
            <>
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] text-accent-amber animate-pulse">{t('provider.oauthPending')}</span>
              </div>
              <p className="text-[9px] text-text-dim mt-2">{t('provider.oauthPendingHint')}</p>
              <div className="mt-2.5">
                <PixelButton size="sm" variant="ghost" onClick={cancelOAuthFlow} className="text-accent-amber border-accent-amber">
                  {t('provider.oauthCancel')}
                </PixelButton>
              </div>
            </>
          )}

          {/* Connected */}
          {isOAuthConnected && oauthStatus !== 'pending' && (
            <>
              <div className="flex items-center gap-2.5">
                <span className="inline-block w-2 h-2 bg-accent-green shadow-[0_0_6px_rgba(107,203,119,0.5)]" />
                <span className="text-[12px] text-accent-green font-medium">{t('provider.oauthConnected')}</span>
                {entry.oauth?.accountId && entry.oauthConfig?.sdkType === 'codex' && (
                  <span className="text-[10px] text-text-dim">ChatGPT Plus</span>
                )}
                <div className="ml-auto">
                  <PixelButton size="sm" variant="ghost" onClick={disconnectOAuth} className="text-accent-red">
                    {t('provider.oauthDisconnect')}
                  </PixelButton>
                </div>
              </div>
              <p className="text-[9px] text-text-dim mt-1.5">
                {t('provider.oauthTokenExpiry', { minutes: tokenExpiryMinutes })}
              </p>
            </>
          )}

          {/* Error */}
          {oauthStatus === 'error' && oauthError && (
            <>
              <div className="mt-2 p-2 bg-accent-red/10 border-2 border-accent-red/30">
                <span className="text-[10px] text-accent-red font-mono">{oauthError}</span>
              </div>
              <div className="mt-2.5">
                <PixelButton size="sm" variant="primary" onClick={startOAuthFlow}>
                  {t('common:button.retry')}
                </PixelButton>
              </div>
            </>
          )}
        </div>
      )}

      {/* "Or use API Key" divider for OAuth providers */}
      {isOAuth && !editing && (
        <div className="flex items-center gap-3 my-3.5 text-text-dim text-[10px]">
          <div className="flex-1 border-t border-dashed border-border-dim" />
          {t('provider.oauthOrApiKey')}
          <div className="flex-1 border-t border-dashed border-border-dim" />
        </div>
      )}

      {/* Edit mode */}
      {editing ? (
        <div className="flex flex-col gap-3 mt-3">
          <PixelInput
            label={t('providers.nameLabel')}
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <PixelInput
            label={t('provider.apiKeyInputLabel')}
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
            {showKey ? t('provider.hideKey') : t('provider.showKey')}
          </PixelButton>
          <PixelInput
            label={t('provider.baseUrlOptional')}
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      ) : !isOAuth ? (
        <div className="mt-2">
          {/* API Key display */}
          <div className="flex items-center gap-2">
            <label className="font-pixel text-[8px] text-text-dim">{t('provider.apiKeyLabel')}</label>
            {entry.apiKey ? (
              <span className="text-[11px] text-text-secondary font-mono">
                {showKey ? entry.apiKey : maskedKey}
              </span>
            ) : (
              <span className="text-[11px] text-text-dim italic">{t('provider.notSet')}</span>
            )}
            {entry.apiKey && (
              <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                {showKey ? t('provider.hide') : t('provider.show')}
              </PixelButton>
            )}
          </div>
          {/* Base URL display */}
          {entry.baseUrl && (
            <div className="flex items-center gap-2 mt-1">
              <label className="font-pixel text-[8px] text-text-dim">{t('provider.urlLabel')}</label>
              <span className="text-[11px] text-text-secondary font-mono">{entry.baseUrl}</span>
            </div>
          )}
        </div>
      ) : entry.apiKey ? (
        /* OAuth provider with API key set — show it below the divider */
        <div className="mt-0">
          <div className="flex items-center gap-2">
            <label className="font-pixel text-[8px] text-text-dim">{t('provider.apiKeyLabel')}</label>
            <span className="text-[11px] text-text-secondary font-mono">
              {showKey ? entry.apiKey : maskedKey}
            </span>
            <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
              {showKey ? t('provider.hide') : t('provider.show')}
            </PixelButton>
          </div>
        </div>
      ) : null}

      {/* Models section (collapsible) */}
      <div className="mt-3 border-t-2 border-border-dim pt-2">
        <button
          onClick={() => setModelsExpanded(!modelsExpanded)}
          className="flex items-center gap-2 cursor-pointer w-full text-left"
        >
          <span className="text-[10px] text-text-dim">{modelsExpanded ? '\u25BE' : '\u25B8'}</span>
          <span className="font-pixel text-[9px] text-text-secondary">
            {t('provider.modelsCount', { count: safeEntry.models.length })}
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
              <PixelButton size="sm" variant="ghost" onClick={handleAddModel}>{t('provider.addModel')}</PixelButton>
            </div>
          </div>
        )}
      </div>
    </PixelCard>
  )
}

// ========== About Tab ==========
function AboutTab() {
  const { t } = useTranslation('settings')
  const appVersion = window.electronAPI?.getAppVersion() ?? '0.1.0'
  const platformLabel = window.electronAPI?.getPlatformLabel()

  const updateState = useAppStore(s => s.updateState)
  const notificationsEnabled = useAppStore(s => s.updateNotificationsEnabled)
  const setUpdateNotifications = useAppStore(s => s.setUpdateNotifications)
  const settings = useAppStore(s => s.settings)
  const telemetryEnabled = useAppStore(s => s.settings?.telemetryEnabled ?? true)
  const updateSettings = useAppStore(s => s.updateSettings)

  const status = updateState?.status ?? 'idle'

  async function handleRestart() {
    const result = await window.electronAPI?.restartAndInstall()
    if (result?.blocked) {
      const confirmed = window.confirm(
        t('update.restartConfirm', { count: result.activeChatCount }),
      )
      if (confirmed) {
        window.electronAPI?.forceRestartAndInstall()
      }
    }
  }

  function handleOpenRelease() {
    if (updateState?.version) {
      window.electronAPI?.openReleaseUrl(updateState.version)
    }
  }

  function handleCheckNow() {
    window.electronAPI?.checkForUpdatesNow()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* App Info */}
      <PixelCard>
        <div className="flex flex-col items-center py-4 gap-2">
          <div className="font-arcade text-[14px] text-text-primary">Golemancy</div>
          <div className="font-mono text-[13px] text-text-secondary">v{appVersion}</div>
          <div className="text-[12px] text-text-dim">{t('about.slogan')}</div>
          <div className="flex gap-4 mt-2">
            <a href="https://golemancy.ai" target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent-blue hover:underline">{t('about.links.website')}</a>
            <a href="https://github.com/jicaiinc/golemancy" target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent-blue hover:underline">{t('about.links.github')}</a>
            <a href="https://discord.gg/xksGkxd6SV" target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent-blue hover:underline">{t('about.links.discord')}</a>
            <a href="https://x.com/golemancyai" target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent-blue hover:underline">{t('about.links.twitter')}</a>
          </div>
          <div className="text-[10px] text-text-dim mt-1">{t('about.copyright')}</div>
        </div>
      </PixelCard>

      {/* Updates */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('update.sectionTitle')}</div>

        {/* Toggle */}
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <button
            type="button"
            role="switch"
            aria-checked={notificationsEnabled}
            onClick={() => setUpdateNotifications(!notificationsEnabled)}
            className={`relative inline-flex h-5 w-9 items-center border-2 transition-colors ${
              notificationsEnabled ? 'bg-accent-green border-accent-green' : 'bg-deep border-border-dim'
            }`}
          >
            <span className={`inline-block h-3 w-3 bg-text-primary transition-transform ${
              notificationsEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
          <span className="text-[12px] text-text-primary">{t('update.checkForUpdates')}</span>
        </label>

        {/* Update status */}
        {status === 'checking' && (
          <div className="text-[12px] text-text-secondary">{t('update.checking')}</div>
        )}

        {status === 'downloading' && (
          <div className="p-3 border-2 border-border-dim">
            <div className="text-[12px] text-text-secondary mb-2">
              {t('update.downloading', { percent: updateState?.downloadProgress ?? 0 })}
            </div>
            <div className="w-full h-2 bg-deep border border-border-dim">
              <div
                className="h-full bg-accent-blue transition-[width] duration-300"
                style={{ width: `${updateState?.downloadProgress ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="p-3 border-2 border-accent-green">
            <div className="text-[12px] text-text-primary mb-3">
              {t('update.downloaded', { version: updateState?.version })}
              {' '}
              <button onClick={handleOpenRelease} className="text-accent-blue hover:underline">
                {t('update.seeChangelog')}
              </button>
            </div>
            <PixelButton size="sm" variant="primary" onClick={handleRestart}>
              {t('update.restart')}
            </PixelButton>
          </div>
        )}

        {status === 'available' && updateState?.isLinuxFallback && (
          <div className="p-3 border-2 border-accent-green">
            <div className="font-pixel text-[9px] text-accent-green mb-2">{t('update.available')}</div>
            <div className="text-[12px] text-text-primary mb-3">
              {t('update.newVersion', { current: appVersion, latest: updateState.version })}
            </div>
            <PixelButton size="sm" variant="primary" onClick={handleOpenRelease}>
              {platformLabel ? t('update.download', { platform: platformLabel }) : t('update.downloadGeneric')}
            </PixelButton>
          </div>
        )}

        {status === 'error' && (
          <div className="p-3 border-2 border-accent-red">
            <div className="text-[12px] text-accent-red mb-2">
              {t('update.error', { message: updateState?.error ?? 'Unknown error' })}
            </div>
            <PixelButton size="sm" variant="ghost" onClick={handleCheckNow}>
              {t('update.retryCheck')}
            </PixelButton>
          </div>
        )}

        {status === 'idle' && (
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-text-dim">{t('update.upToDate', { version: appVersion })}</span>
            <PixelButton size="sm" variant="ghost" onClick={handleCheckNow}>
              {t('update.checkNow')}
            </PixelButton>
          </div>
        )}
      </PixelCard>

      {/* Telemetry (Crash Reporting + Product Analytics — single toggle) */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('general.telemetry')}</div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={telemetryEnabled}
            onChange={(e) => updateSettings({ telemetryEnabled: e.target.checked, productAnalyticsEnabled: e.target.checked })}
            className="mt-0.5 accent-accent-green"
          />
          <div>
            <div className="text-[12px] text-text-primary">{t('general.telemetryLabel')}</div>
            <div className="text-[11px] text-text-dim mt-1">{t('general.telemetryDescription')}</div>
          </div>
        </label>
      </PixelCard>
    </div>
  )
}

// ========== General Tab ==========
function GeneralTab() {
  const { t, i18n } = useTranslation('settings')
  const themeMode = useAppStore(s => s.themeMode)
  const setTheme = useAppStore(s => s.setTheme)
  const styleTheme = useAppStore(s => s.styleTheme ?? 'pixel')
  const setStyleTheme = useAppStore(s => s.setStyleTheme)
  const updateSettings = useAppStore(s => s.updateSettings)
  async function handleThemeChange(mode: ThemeMode) {
    setTheme(mode)
    await updateSettings({ theme: mode })
  }
  async function handleStyleThemeChange(theme: StyleTheme) {
    setStyleTheme(theme)
    await updateSettings({ styleTheme: theme })
  }

  const themes: { mode: ThemeMode; label: string; bgPreview: string; surfPreview: string; textPreview: string }[] = [
    { mode: 'light', label: t('general.light'), bgPreview: 'bg-[#F5F3EE]', surfPreview: 'bg-[#DEDBD4]', textPreview: 'bg-[#1A1612]' },
    { mode: 'dark', label: t('general.dark'), bgPreview: 'bg-[#0B0E14]', surfPreview: 'bg-[#1E2430]', textPreview: 'bg-[#E8ECF1]' },
    { mode: 'system', label: t('general.system'), bgPreview: 'bg-gradient-to-r from-[#F5F3EE] to-[#0B0E14]', surfPreview: 'bg-gradient-to-r from-[#DEDBD4] to-[#1E2430]', textPreview: 'bg-gradient-to-r from-[#1A1612] to-[#E8ECF1]' },
  ]

  const languageOptions = LANGUAGES.map(lang => ({
    ...lang,
    selected: i18n.language === lang.value,
  }))

  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">{t('general.appearance')}</div>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(theme => {
            const isActive = themeMode === theme.mode
            return (
              <button
                key={theme.mode}
                onClick={() => handleThemeChange(theme.mode)}
                className={`p-3 border-2 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-elevated border-accent-green'
                    : 'bg-deep border-border-dim hover:border-border-bright'
                }`}
              >
                {/* Mini preview */}
                <div className={`w-full h-12 ${theme.bgPreview} border border-border-dim mb-2 p-1.5 flex flex-col justify-between`}>
                  <div className={`h-1.5 w-3/4 ${theme.surfPreview}`} />
                  <div className={`h-1 w-1/2 ${theme.textPreview}`} />
                  <div className={`h-1 w-2/3 ${theme.textPreview} opacity-50`} />
                </div>
                <div className={`text-[10px] text-center ${isActive ? 'text-accent-green' : 'text-text-secondary'}`}>
                  {theme.label}
                </div>
              </button>
            )
          })}
        </div>
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">{t('general.style')}</div>
        <div className="grid grid-cols-2 gap-3">
          {([
            { theme: 'pixel' as StyleTheme, label: t('general.stylePixel') },
            { theme: 'modern' as StyleTheme, label: t('general.styleModern') },
          ]).map(opt => {
            const isActive = styleTheme === opt.theme
            return (
              <button
                key={opt.theme}
                onClick={() => handleStyleThemeChange(opt.theme)}
                className={`p-3 border-2 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-elevated border-accent-green'
                    : 'bg-deep border-border-dim hover:border-border-bright'
                }`}
              >
                {opt.theme === 'pixel' ? (
                  <div className="w-full mb-2 flex flex-col items-center gap-3 py-3">
                    <span className="text-[14px] text-text-primary leading-none tracking-wider" style={{ fontFamily: '"Press Start 2P", monospace' }}>Aa</span>
                    <div className="w-full px-2 flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        <div className="h-4 flex-1 bg-accent-green/20 border-2 border-accent-green/50" />
                        <div className="h-4 w-8 bg-elevated border-2 border-border-dim" />
                      </div>
                      <div className="h-3 w-full bg-surface border-2 border-border-dim" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full mb-2 flex flex-col items-center gap-3 py-3">
                    <span className="text-[16px] text-text-primary leading-none font-medium" style={{ fontFamily: '"JetBrains Mono", monospace' }}>Aa</span>
                    <div className="w-full px-2 flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        <div className="h-4 flex-1 bg-accent-green/20 border border-accent-green/50" style={{ clipPath: 'inset(0 round 6px)' }} />
                        <div className="h-4 w-8 bg-elevated border border-border-dim" style={{ clipPath: 'inset(0 round 6px)' }} />
                      </div>
                      <div className="h-3 w-full bg-surface border border-border-dim" style={{ clipPath: 'inset(0 round 6px)' }} />
                    </div>
                  </div>
                )}
                <div className={`text-[10px] text-center ${isActive ? 'text-accent-green' : 'text-text-secondary'}`}>
                  {opt.label}
                </div>
              </button>
            )
          })}
        </div>
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-4">{t('general.language')}</div>
        <PixelDropdown
          trigger={
            <PixelButton variant="ghost" className="min-w-[160px] text-left justify-between">
              <span className="font-mono text-[12px]">
                {languageOptions.find(o => o.value === i18n.language)?.label ?? 'English'}
              </span>
              <span className="ml-2 text-text-dim">{'\u25BC'}</span>
            </PixelButton>
          }
          items={languageOptions}
          onSelect={value => { i18n.changeLanguage(value); updateSettings({ language: value }) }}
        />
      </PixelCard>

    </div>
  )
}
