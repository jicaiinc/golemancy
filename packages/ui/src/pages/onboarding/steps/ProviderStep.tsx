import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProviderSdkType, AgentModelConfig, OAuthFlowStatus } from '@golemancy/shared'
import { PixelCard, PixelButton, PixelInput } from '../../../components'
import { PROVIDER_PRESETS } from '../../../lib/provider-presets'
import { getServices } from '../../../services/container'

interface ProviderStepProps {
  selectedProvider: string | null
  apiKey: string
  baseUrl: string
  providerTestStatus: 'untested' | 'testing' | 'ok' | 'error'
  defaultModel: AgentModelConfig | null
  onUpdate: (data: {
    selectedProvider?: string | null
    apiKey?: string
    baseUrl?: string
    providerTestStatus?: 'untested' | 'testing' | 'ok' | 'error'
    defaultModel?: AgentModelConfig | null
  }) => void
  onTestProvider: () => Promise<void>
  onSaveProvider?: () => Promise<void>
  isOAuthProvider?: boolean
}

// Provider/SDK type labels are brand names — not translated per guidelines
const SDK_TYPE_OPTIONS: { value: ProviderSdkType; label: string }[] = [
  { value: 'openai-compatible', label: 'OpenAI-Compatible' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'groq', label: 'Groq' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'moonshot', label: 'Moonshot (Kimi)' },
  { value: 'alibaba', label: 'Alibaba (Qwen)' },
]

export function ProviderStep({
  selectedProvider,
  apiKey,
  baseUrl,
  providerTestStatus,
  defaultModel,
  onUpdate,
  onTestProvider,
  onSaveProvider,
  isOAuthProvider,
}: ProviderStepProps) {
  const { t } = useTranslation(['onboarding', 'common', 'settings'])
  const [showKey, setShowKey] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customSdkType, setCustomSdkType] = useState<ProviderSdkType>('openai-compatible')
  const [testError, setTestError] = useState('')

  // OAuth state
  const [oauthStatus, setOauthStatus] = useState<OAuthFlowStatus>('idle')
  const [oauthError, setOauthError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const providerKey = selectedProvider && !selectedProvider.startsWith('custom:') ? selectedProvider : null

  const startOAuthFlow = useCallback(async () => {
    if (!providerKey) return
    const services = getServices()
    if (!services.settings.startOAuthFlow) return
    setOauthStatus('pending')
    setOauthError('')
    try {
      // Save provider to server first so OAuth flow can find the config
      if (onSaveProvider) await onSaveProvider()
      const { authUrl } = await services.settings.startOAuthFlow(providerKey)
      if (window.electronAPI?.openExternalUrl) {
        await window.electronAPI.openExternalUrl(authUrl)
      } else {
        window.open(authUrl, '_blank')
      }
      pollRef.current = setInterval(async () => {
        try {
          const flowState = await services.settings.getOAuthFlowStatus!(providerKey)
          if (flowState.status === 'success') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setOauthStatus('success')
            // OAuth token exchange already validated credentials — mark as ok
            onUpdate({ providerTestStatus: 'ok' })
          } else if (flowState.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setOauthStatus('error')
            setOauthError(flowState.error ?? t('settings:provider.oauthError'))
          }
        } catch {
          // ignore polling errors
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
  }, [providerKey, onSaveProvider, onUpdate, t])

  const cancelOAuthFlow = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setOauthStatus('idle')
    setOauthError('')
    if (providerKey) {
      try {
        await getServices().settings.cancelOAuthFlow?.(providerKey)
      } catch {
        // ignore
      }
    }
  }, [providerKey])

  const preset = selectedProvider ? PROVIDER_PRESETS[selectedProvider] : null
  const models = preset?.defaultModels ?? []

  function handleSelectPreset(key: string) {
    setCustomMode(false)
    onUpdate({
      selectedProvider: key,
      apiKey: '',
      baseUrl: PROVIDER_PRESETS[key]?.defaultBaseUrl ?? '',
      providerTestStatus: 'untested',
      defaultModel: null,
    })
    setTestError('')
  }

  function handleSelectCustom() {
    setCustomMode(true)
    onUpdate({
      selectedProvider: null,
      apiKey: '',
      baseUrl: '',
      providerTestStatus: 'untested',
      defaultModel: null,
    })
    setTestError('')
  }

  function handleConfirmCustom() {
    const name = customName.trim()
    if (!name) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom'
    onUpdate({
      selectedProvider: `custom:${slug}:${customSdkType}:${name}`,
      apiKey: '',
      baseUrl: '',
      providerTestStatus: 'untested',
      defaultModel: null,
    })
    setCustomMode(false)
  }

  async function handleTest() {
    setTestError('')
    try {
      await onTestProvider()
    } catch (err) {
      setTestError(err instanceof Error ? err.message : t('error.testFailed'))
    }
  }

  function handleModelSelect(model: string) {
    if (!selectedProvider) return
    const providerKey = selectedProvider.startsWith('custom:')
      ? selectedProvider.split(':')[1]
      : selectedProvider
    onUpdate({ defaultModel: { provider: providerKey, model } })
  }

  // Determine if we're editing a custom provider
  const isCustomProvider = selectedProvider?.startsWith('custom:')
  const customProviderName = isCustomProvider ? selectedProvider!.split(':').slice(3).join(':') : null

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="font-pixel text-[14px] text-text-primary mb-2">{t('provider.heading')}</h2>
        <p className="font-mono text-[11px] text-text-dim">{t('provider.description')}</p>
      </div>

      {/* Provider grid */}
      {!selectedProvider && !customMode && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => handleSelectPreset(key)}
              className={`p-3 border-2 cursor-pointer transition-colors text-left ${
                p.oauthConfig
                  ? 'border-[rgba(123,143,168,0.45)] bg-gradient-to-br from-deep to-[rgba(107,203,119,0.03)] hover:border-[rgba(123,143,168,0.7)]'
                  : 'border-border-dim bg-deep hover:border-accent-green'
              }`}
            >
              <div className="text-[11px] text-text-primary">{p.name}</div>
              {p.oauthConfig ? (
                <div className="flex gap-1 mt-1 items-center">
                  <span className="font-mono text-[7px] text-[#7B8FA8] bg-[rgba(123,143,168,0.1)] border border-[rgba(123,143,168,0.3)] px-1 leading-[14px] tracking-wide">OAUTH</span>
                  <span className="font-mono text-[7px] text-accent-green bg-accent-green/10 border border-accent-green/30 px-1 leading-[14px] tracking-wide whitespace-nowrap">{t('settings:provider.oauthNoApiFees')}</span>
                </div>
              ) : (
                <div className="text-[9px] text-text-dim mt-1">{p.sdkType}</div>
              )}
            </button>
          ))}
          <button
            onClick={handleSelectCustom}
            className="p-3 border-2 border-border-dim border-dashed bg-deep hover:border-accent-green cursor-pointer transition-colors text-left"
          >
            <div className="text-[11px] text-text-primary">{t('provider.customLabel')}</div>
            <div className="text-[9px] text-text-dim mt-1">{t('provider.customSubtitle')}</div>
          </button>
        </div>
      )}

      {/* Custom provider form */}
      {customMode && !selectedProvider && (
        <PixelCard variant="outlined">
          <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('provider.customCardTitle')}</div>
          <div className="flex flex-col gap-3">
            <PixelInput
              label={t('provider.labelName')}
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="My Provider"
            />
            <div>
              <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('provider.labelSdkType')}</label>
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
              <PixelButton size="sm" variant="primary" onClick={handleConfirmCustom} disabled={!customName.trim()}>
                {t('button.continue')}
              </PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => { setCustomMode(false); onUpdate({ selectedProvider: null }) }}>
                {t('common:button.back')}
              </PixelButton>
            </div>
          </div>
        </PixelCard>
      )}

      {/* Selected provider — API key & test (or OAuth sign-in) */}
      {selectedProvider && (
        <PixelCard className={isOAuthProvider ? 'border-[rgba(123,143,168,0.35)]' : undefined}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="font-pixel text-[11px] text-text-primary">
                {isCustomProvider ? customProviderName : preset?.name}
              </span>
              {isOAuthProvider && (
                <>
                  <span className="font-pixel text-[7px] text-[#7B8FA8] bg-[rgba(123,143,168,0.1)] border border-[rgba(123,143,168,0.3)] px-1.5 py-0.5 tracking-wide">OAUTH</span>
                  <span className="font-pixel text-[7px] text-accent-green bg-accent-green/10 border border-accent-green/30 px-1.5 py-0.5 tracking-wide">{t('settings:provider.oauthNoApiFees')}</span>
                </>
              )}
              {providerTestStatus === 'ok' && (
                <span className="text-[10px] text-accent-green">{'\u2705'} {t('provider.statusConnected')}</span>
              )}
              {providerTestStatus === 'error' && (
                <span className="text-[10px] text-accent-red">{'\u274C'} {t('provider.statusFailed')}</span>
              )}
            </div>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => {
                if (isOAuthProvider && oauthStatus === 'pending') cancelOAuthFlow()
                onUpdate({ selectedProvider: null, apiKey: '', baseUrl: '', providerTestStatus: 'untested', defaultModel: null })
                setOauthStatus('idle')
                setOauthError('')
              }}
            >
              {t('button.change')}
            </PixelButton>
          </div>

          {/* OAuth sign-in section */}
          {isOAuthProvider && (
            <div className={`p-3.5 bg-deep border-2 mb-3 ${
              oauthStatus === 'pending' ? 'border-accent-amber' :
              oauthStatus === 'error' ? 'border-accent-red' :
              providerTestStatus === 'ok' ? 'border-accent-green' :
              'border-border-dim'
            }`}>
              {/* Not connected */}
              {oauthStatus !== 'pending' && providerTestStatus !== 'ok' && oauthStatus !== 'error' && (
                <>
                  <button
                    onClick={startOAuthFlow}
                    className="w-full py-2.5 px-5 border-2 border-accent-green bg-gradient-to-br from-[#1a3a1a] to-[#0d2a0d] text-accent-green font-mono text-[13px] font-semibold cursor-pointer hover:from-[#1f4a1f] hover:to-[#0f350f] hover:shadow-[0_0_12px_rgba(107,203,119,0.2)] transition-all tracking-wide"
                  >
                    {t('settings:provider.oauthSignIn', { provider: 'ChatGPT' })}
                  </button>
                  <p className="text-[9px] text-text-dim mt-2 leading-relaxed">{t('settings:provider.oauthSubscriptionHint')}</p>
                </>
              )}

              {/* Pending */}
              {oauthStatus === 'pending' && (
                <>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-accent-amber animate-pulse">{t('settings:provider.oauthPending')}</span>
                  </div>
                  <p className="text-[9px] text-text-dim mt-2">{t('settings:provider.oauthPendingHint')}</p>
                  <div className="mt-2.5">
                    <PixelButton size="sm" variant="ghost" onClick={cancelOAuthFlow} className="text-accent-amber border-accent-amber">
                      {t('settings:provider.oauthCancel')}
                    </PixelButton>
                  </div>
                </>
              )}

              {/* Connected (test passed) */}
              {providerTestStatus === 'ok' && oauthStatus !== 'pending' && (
                <div className="flex items-center gap-2.5">
                  <span className="inline-block w-2 h-2 bg-accent-green shadow-[0_0_6px_rgba(107,203,119,0.5)]" />
                  <span className="text-[12px] text-accent-green font-medium">{t('settings:provider.oauthConnected')}</span>
                </div>
              )}

              {/* Error */}
              {oauthStatus === 'error' && oauthError && (
                <>
                  <div className="p-2 bg-accent-red/10 border-2 border-accent-red/30">
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

          {/* API key section — hidden for OAuth providers unless explicitly toggled */}
          {!isOAuthProvider && (
            <div className="flex flex-col gap-3">
              {/* API Key */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <PixelInput
                    label={t('provider.labelApiKey')}
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => onUpdate({ apiKey: e.target.value, providerTestStatus: 'untested' })}
                    placeholder="sk-..."
                  />
                </div>
                <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                  {showKey ? t('button.hide') : t('button.show')}
                </PixelButton>
              </div>

              {/* Base URL (optional for presets, shown for custom) */}
              {(isCustomProvider || baseUrl) && (
                <PixelInput
                  label={t('provider.labelBaseUrl')}
                  value={baseUrl}
                  onChange={e => onUpdate({ baseUrl: e.target.value, providerTestStatus: 'untested' })}
                  placeholder="https://api.example.com/v1"
                />
              )}

              {/* Test button */}
              <div className="flex items-center gap-2">
                <PixelButton
                  size="sm"
                  variant={providerTestStatus === 'ok' ? 'ghost' : 'secondary'}
                  onClick={handleTest}
                  disabled={providerTestStatus === 'testing' || !apiKey || (isCustomProvider && models.length === 0 && !defaultModel?.model?.trim())}
                >
                  {providerTestStatus === 'testing' ? t('button.testing') : providerTestStatus === 'ok' ? t('button.reTest') : t('button.testConnection')}
                </PixelButton>
                {providerTestStatus === 'testing' && (
                  <span className="text-[10px] text-accent-blue animate-pulse">{t('provider.statusConnecting')}</span>
                )}
              </div>

              {/* Test error */}
              {providerTestStatus === 'error' && testError && (
                <div className="p-2 bg-accent-red/10 border-2 border-accent-red/30">
                  <span className="text-[10px] text-accent-red font-mono break-all">{testError}</span>
                </div>
              )}
            </div>
          )}

          {/* Default model selector (after test passes, or always for custom providers) */}
          {(providerTestStatus === 'ok' || (isCustomProvider && models.length === 0)) && (
            <div className="mt-2 pt-3 border-t-2 border-border-dim">
              <div className="font-pixel text-[10px] text-text-secondary mb-2">{t('provider.defaultModel.title')}</div>
              <p className="text-[11px] text-text-dim mb-3">
                {models.length > 0
                  ? t('provider.defaultModel.descriptionPreset')
                  : t('provider.defaultModel.descriptionCustom')}
              </p>
              {models.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {models.map(m => (
                    <button
                      key={m}
                      onClick={() => handleModelSelect(m)}
                      className={`px-3 py-2 border-2 cursor-pointer transition-colors text-[11px] font-mono ${
                        defaultModel?.model === m
                          ? 'bg-accent-green/15 border-accent-green text-text-primary'
                          : 'bg-deep border-border-dim hover:border-border-bright text-text-secondary'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ) : (
                <PixelInput
                  label={t('provider.defaultModel.labelModelName')}
                  value={defaultModel?.model ?? ''}
                  onChange={e => handleModelSelect(e.target.value)}
                  placeholder="e.g. gpt-4o, claude-sonnet-4-5"
                />
              )}
            </div>
          )}
        </PixelCard>
      )}
    </div>
  )
}
