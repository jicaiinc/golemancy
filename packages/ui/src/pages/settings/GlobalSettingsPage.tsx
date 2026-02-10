import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { AIProvider, ProviderConfig } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { PixelCard, PixelButton, PixelInput, PixelTabs } from '../../components'

const SETTINGS_TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'general', label: 'General' },
]

const PROVIDER_INFO: Record<AIProvider, { name: string; icon: string; color: string }> = {
  openai: { name: 'OpenAI', icon: '\u{1F916}', color: 'border-accent-green' },
  anthropic: { name: 'Anthropic', icon: '\u{1F9E0}', color: 'border-accent-purple' },
  google: { name: 'Google', icon: '\u{1F50D}', color: 'border-accent-blue' },
  custom: { name: 'Custom', icon: '\u2699', color: 'border-accent-amber' },
}

export function GlobalSettingsPage() {
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('providers')

  if (!settings) return null

  return (
    <div className="h-full overflow-auto bg-void">
      <div className="max-w-[800px] mx-auto p-8">
        {/* Back button + title */}
        <div className="flex items-center gap-4 mb-6">
          <PixelButton variant="ghost" size="sm" onClick={() => navigate('/')}>
            &larr; Back
          </PixelButton>
          <h1 className="font-pixel text-[16px] text-accent-green">Global Settings</h1>
        </div>

        <PixelTabs tabs={SETTINGS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-4">
          {activeTab === 'providers' && (
            <ProvidersTab settings={settings} onUpdate={updateSettings} />
          )}
          {activeTab === 'general' && <GeneralTab />}
        </div>
      </div>
    </div>
  )
}

// ========== Providers Tab ==========
function ProvidersTab({ settings, onUpdate }: {
  settings: NonNullable<ReturnType<typeof useAppStore.getState>['settings']>
  onUpdate: (data: Partial<typeof settings>) => Promise<void>
}) {
  const [defaultProvider, setDefaultProvider] = useState(settings.defaultProvider)
  const [saved, setSaved] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/* Default provider selector */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">DEFAULT PROVIDER</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(Object.keys(PROVIDER_INFO) as AIProvider[]).map(key => {
            const info = PROVIDER_INFO[key]
            const isSelected = defaultProvider === key
            return (
              <button
                key={key}
                onClick={async () => {
                  setDefaultProvider(key)
                  await onUpdate({ defaultProvider: key })
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                }}
                className={`p-3 border-2 cursor-pointer transition-colors text-left ${
                  isSelected
                    ? `bg-elevated ${info.color} border-l-4`
                    : 'bg-deep border-border-dim hover:border-border-bright'
                }`}
              >
                <div className="text-[16px] mb-1">{info.icon}</div>
                <div className="text-[11px] text-text-primary">{info.name}</div>
                {isSelected && <div className="text-[9px] text-accent-green mt-1">Active</div>}
              </button>
            )
          })}
        </div>
        {saved && <span className="text-[11px] text-accent-green mt-2 block">Provider updated!</span>}
      </PixelCard>

      {/* Configured providers */}
      <div className="font-pixel text-[10px] text-text-secondary mt-2">CONFIGURED PROVIDERS</div>
      {settings.providers.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-6">
          <p className="text-[12px] text-text-dim">No providers configured</p>
        </PixelCard>
      ) : (
        settings.providers.map((provider, i) => (
          <ProviderCard key={i} provider={provider} onUpdate={onUpdate} allProviders={settings.providers} index={i} />
        ))
      )}
    </div>
  )
}

// ========== Provider Card ==========
function ProviderCard({ provider, onUpdate, allProviders, index }: {
  provider: ProviderConfig
  onUpdate: (data: Partial<{ providers: ProviderConfig[] }>) => Promise<void>
  allProviders: ProviderConfig[]
  index: number
}) {
  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState(provider.apiKey)
  const [defaultModel, setDefaultModel] = useState(provider.defaultModel)
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const info = PROVIDER_INFO[provider.provider]

  async function handleSave() {
    const updated = [...allProviders]
    updated[index] = { ...provider, apiKey, defaultModel, baseUrl: baseUrl || undefined }
    await onUpdate({ providers: updated })
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <PixelCard>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[14px]">{info.icon}</span>
        <span className="font-pixel text-[10px] text-text-primary">{info.name}</span>
        <span className="text-[11px] text-text-dim font-mono">{provider.defaultModel}</span>
        <div className="ml-auto flex gap-1">
          {!editing ? (
            <PixelButton size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</PixelButton>
          ) : (
            <>
              <PixelButton size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</PixelButton>
              <PixelButton size="sm" variant="primary" onClick={handleSave}>Save</PixelButton>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <PixelInput
            label="API KEY"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide Key' : 'Show Key'}
          </PixelButton>
          <PixelInput
            label="DEFAULT MODEL"
            value={defaultModel}
            onChange={e => setDefaultModel(e.target.value)}
          />
          <PixelInput
            label="BASE URL (optional)"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="font-pixel text-[8px] text-text-dim">API KEY</label>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-9 bg-deep px-3 flex items-center font-mono text-[13px] text-text-primary border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)]">
                  {showKey ? provider.apiKey : '\u2022'.repeat(Math.min(provider.apiKey.length, 20))}
                </div>
                <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                  {showKey ? 'Hide' : 'Show'}
                </PixelButton>
              </div>
            </div>
          </div>
          {provider.baseUrl && (
            <div className="mt-2">
              <label className="font-pixel text-[8px] text-text-dim">BASE URL</label>
              <div className="text-[12px] text-text-secondary font-mono mt-0.5">{provider.baseUrl}</div>
            </div>
          )}
        </>
      )}
      {saved && <span className="text-[11px] text-accent-green mt-2 block">Saved!</span>}
    </PixelCard>
  )
}

// ========== General Tab ==========
function GeneralTab() {
  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">THEME</div>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-deep border-2 border-accent-green cursor-pointer">
            <div className="w-8 h-6 bg-void border border-border-dim" />
            <div className="text-[9px] text-accent-green mt-1 text-center">Dark</div>
          </div>
          <div className="p-3 bg-deep border-2 border-border-dim opacity-40 cursor-not-allowed">
            <div className="w-8 h-6 bg-[#f0f0f0] border border-[#ccc]" />
            <div className="text-[9px] text-text-dim mt-1 text-center">Light</div>
          </div>
        </div>
        <p className="text-[11px] text-text-dim mt-2">Only dark theme is available in v1</p>
      </PixelCard>

      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">ABOUT</div>
        <div className="text-[12px] text-text-primary">SoloCraft</div>
        <div className="text-[11px] text-text-dim mt-1">v0.1.0</div>
        <div className="text-[11px] text-text-dim mt-1">AI Agent Orchestrator for Solo Creators</div>
      </PixelCard>
    </div>
  )
}
