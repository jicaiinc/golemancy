import { useState } from 'react'
import type { ProviderSdkType, ProviderEntry, AgentModelConfig } from '@golemancy/shared'
import { PixelCard, PixelButton, PixelInput } from '../../../components'
import { PROVIDER_PRESETS } from '../../../lib/provider-presets'

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
}

const SDK_TYPE_OPTIONS: { value: ProviderSdkType; label: string }[] = [
  { value: 'openai-compatible', label: 'OpenAI-Compatible' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
]

export function ProviderStep({
  selectedProvider,
  apiKey,
  baseUrl,
  providerTestStatus,
  defaultModel,
  onUpdate,
  onTestProvider,
}: ProviderStepProps) {
  const [showKey, setShowKey] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customSdkType, setCustomSdkType] = useState<ProviderSdkType>('openai-compatible')
  const [testError, setTestError] = useState('')

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
      setTestError(err instanceof Error ? err.message : 'Test failed')
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
        <h2 className="font-pixel text-[14px] text-text-primary mb-2">Connect an AI Provider</h2>
        <p className="font-mono text-[11px] text-text-dim">Choose a provider and enter your API key to get started.</p>
      </div>

      {/* Provider grid */}
      {!selectedProvider && !customMode && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => handleSelectPreset(key)}
              className="p-3 border-2 border-border-dim bg-deep hover:border-accent-green cursor-pointer transition-colors text-left"
            >
              <div className="text-[11px] text-text-primary">{p.name}</div>
              <div className="text-[9px] text-text-dim mt-1">{p.sdkType}</div>
            </button>
          ))}
          <button
            onClick={handleSelectCustom}
            className="p-3 border-2 border-border-dim border-dashed bg-deep hover:border-accent-green cursor-pointer transition-colors text-left"
          >
            <div className="text-[11px] text-text-primary">Custom</div>
            <div className="text-[9px] text-text-dim mt-1">any endpoint</div>
          </button>
        </div>
      )}

      {/* Custom provider form */}
      {customMode && !selectedProvider && (
        <PixelCard variant="outlined">
          <div className="font-pixel text-[10px] text-text-secondary mb-3">CUSTOM PROVIDER</div>
          <div className="flex flex-col gap-3">
            <PixelInput
              label="NAME"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="My Provider"
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
              <PixelButton size="sm" variant="primary" onClick={handleConfirmCustom} disabled={!customName.trim()}>
                Continue
              </PixelButton>
              <PixelButton size="sm" variant="ghost" onClick={() => { setCustomMode(false); onUpdate({ selectedProvider: null }) }}>
                Back
              </PixelButton>
            </div>
          </div>
        </PixelCard>
      )}

      {/* Selected provider — API key & test */}
      {selectedProvider && (
        <PixelCard>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="font-pixel text-[11px] text-text-primary">
                {isCustomProvider ? customProviderName : preset?.name}
              </span>
              {providerTestStatus === 'ok' && (
                <span className="text-[10px] text-accent-green">{'\u2705'} Connected</span>
              )}
              {providerTestStatus === 'error' && (
                <span className="text-[10px] text-accent-red">{'\u274C'} Failed</span>
              )}
            </div>
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => onUpdate({ selectedProvider: null, apiKey: '', baseUrl: '', providerTestStatus: 'untested', defaultModel: null })}
            >
              Change
            </PixelButton>
          </div>

          <div className="flex flex-col gap-3">
            {/* API Key */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <PixelInput
                  label="API KEY"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => onUpdate({ apiKey: e.target.value, providerTestStatus: 'untested' })}
                  placeholder="sk-..."
                />
              </div>
              <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                {showKey ? 'Hide' : 'Show'}
              </PixelButton>
            </div>

            {/* Base URL (optional for presets, shown for custom) */}
            {(isCustomProvider || baseUrl) && (
              <PixelInput
                label="BASE URL"
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
                {providerTestStatus === 'testing' ? 'Testing...' : providerTestStatus === 'ok' ? 'Re-test' : 'Test Connection'}
              </PixelButton>
              {providerTestStatus === 'testing' && (
                <span className="text-[10px] text-accent-blue animate-pulse">Connecting...</span>
              )}
            </div>

            {/* Test error */}
            {providerTestStatus === 'error' && testError && (
              <div className="p-2 bg-accent-red/10 border-2 border-accent-red/30">
                <span className="text-[10px] text-accent-red font-mono break-all">{testError}</span>
              </div>
            )}

            {/* Default model selector (after test passes, or always for custom providers) */}
            {(providerTestStatus === 'ok' || (isCustomProvider && models.length === 0)) && (
              <div className="mt-2 pt-3 border-t-2 border-border-dim">
                <div className="font-pixel text-[10px] text-text-secondary mb-2">DEFAULT MODEL</div>
                <p className="text-[11px] text-text-dim mb-3">
                  {models.length > 0
                    ? 'Choose a model to use by default for new agents.'
                    : 'Enter the model name to use by default.'}
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
                    label="MODEL NAME"
                    value={defaultModel?.model ?? ''}
                    onChange={e => handleModelSelect(e.target.value)}
                    placeholder="e.g. gpt-4o, claude-sonnet-4-5"
                  />
                )}
              </div>
            )}
          </div>
        </PixelCard>
      )}
    </div>
  )
}
