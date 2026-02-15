import { useState } from 'react'
import type { AIProvider, ProviderConfig, ThemeMode } from '@golemancy/shared'
import { APP_VERSION } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { PixelCard, PixelButton, PixelInput, PixelTabs } from '../../components'
import { GlobalLayout } from '../../app/layouts/GlobalLayout'

const SETTINGS_TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'profile', label: 'Profile' },
  { id: 'paths', label: 'Paths' },
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
  const [activeTab, setActiveTab] = useState('providers')

  if (!settings) return null

  return (
    <GlobalLayout title="Global Settings" showBack backLabel="All Projects">
      <div data-testid="settings-form" className="max-w-[1000px] mx-auto p-8">
        <PixelTabs tabs={SETTINGS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mt-4">
          {activeTab === 'providers' && (
            <ProvidersTab settings={settings} onUpdate={updateSettings} />
          )}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'paths' && <PathsTab />}
        </div>

        {/* About footer */}
        <div className="mt-8 pt-4 border-t-2 border-border-dim text-center">
          <span className="text-[11px] text-text-dim">
            Golemancy v{APP_VERSION} — AI Agent Orchestrator for Solo Creators
          </span>
        </div>
      </div>
    </GlobalLayout>
  )
}

// Default models per provider
const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250929',
  google: 'gemini-2.5-flash',
  custom: '',
}

// ========== Providers Tab ==========
function ProvidersTab({ settings, onUpdate }: {
  settings: NonNullable<ReturnType<typeof useAppStore.getState>['settings']>
  onUpdate: (data: Partial<typeof settings>) => Promise<void>
}) {
  const [defaultProvider, setDefaultProvider] = useState(settings.defaultProvider)
  const [saved, setSaved] = useState(false)
  // Track which provider card should open in edit mode after being auto-created
  const [autoEditProvider, setAutoEditProvider] = useState<AIProvider | null>(null)

  async function handleProviderClick(key: AIProvider) {
    setDefaultProvider(key)
    const exists = settings.providers.some(p => p.provider === key)
    if (exists) {
      await onUpdate({ defaultProvider: key })
    } else {
      // Auto-create an empty config for this provider
      const newConfig: ProviderConfig = {
        provider: key,
        apiKey: '',
        defaultModel: DEFAULT_MODELS[key],
      }
      await onUpdate({ defaultProvider: key, providers: [...settings.providers, newConfig] })
      setAutoEditProvider(key)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Default provider selector */}
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">DEFAULT PROVIDER</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(Object.keys(PROVIDER_INFO) as AIProvider[]).map(key => {
            const info = PROVIDER_INFO[key]
            const isSelected = defaultProvider === key
            const isConfigured = settings.providers.some(p => p.provider === key)
            return (
              <button
                key={key}
                onClick={() => handleProviderClick(key)}
                className={`p-3 border-2 cursor-pointer transition-colors text-left ${
                  isSelected
                    ? `bg-elevated ${info.color} border-l-4`
                    : 'bg-deep border-border-dim hover:border-border-bright'
                }`}
              >
                <div className="text-[16px] mb-1">{info.icon}</div>
                <div className="text-[11px] text-text-primary">{info.name}</div>
                {isSelected && <div className="text-[9px] text-accent-green mt-1">Active</div>}
                {!isSelected && isConfigured && <div className="text-[9px] text-text-dim mt-1">Configured</div>}
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
          <p className="text-[12px] text-text-dim">Click a provider above to configure it</p>
        </PixelCard>
      ) : (
        settings.providers.map((provider, i) => (
          <ProviderCard
            key={provider.provider}
            provider={provider}
            onUpdate={onUpdate}
            allProviders={settings.providers}
            index={i}
            startEditing={autoEditProvider === provider.provider}
            onEditStarted={() => setAutoEditProvider(null)}
          />
        ))
      )}
    </div>
  )
}

// ========== Provider Card ==========
function ProviderCard({ provider, onUpdate, allProviders, index, startEditing, onEditStarted }: {
  provider: ProviderConfig
  onUpdate: (data: Partial<{ providers: ProviderConfig[] }>) => Promise<void>
  allProviders: ProviderConfig[]
  index: number
  startEditing?: boolean
  onEditStarted?: () => void
}) {
  const [editing, setEditing] = useState(startEditing ?? false)

  // Auto-open edit mode when a new provider is created
  if (startEditing && !editing) {
    setEditing(true)
    onEditStarted?.()
  }
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

// ========== Appearance Tab (ThemeSwitcher) ==========
function AppearanceTab() {
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
        <div className="font-pixel text-[10px] text-text-secondary mb-4">THEME</div>
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

// ========== Profile Tab ==========
function ProfileTab() {
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const [name, setName] = useState(settings?.userProfile.name ?? '')
  const [email, setEmail] = useState(settings?.userProfile.email ?? '')
  const [avatarUrl, setAvatarUrl] = useState(settings?.userProfile.avatarUrl ?? '')
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    await updateSettings({
      userProfile: {
        name: name.trim(),
        email: email.trim(),
        avatarUrl: avatarUrl.trim() || undefined,
      },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">USER PROFILE</div>
        <div className="flex flex-col gap-3">
          <PixelInput
            label="NAME"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
          />
          <PixelInput
            label="EMAIL"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <PixelInput
            label="AVATAR URL (optional)"
            value={avatarUrl}
            onChange={e => setAvatarUrl(e.target.value)}
            placeholder="https://..."
          />
          <div className="flex items-center gap-2">
            <PixelButton variant="primary" size="sm" onClick={handleSave}>
              Save Profile
            </PixelButton>
            {saved && <span className="text-[11px] text-accent-green">Saved!</span>}
          </div>
        </div>
      </PixelCard>
    </div>
  )
}

// ========== Paths Tab ==========
function PathsTab() {
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)
  const [workDir, setWorkDir] = useState(settings?.defaultWorkingDirectoryBase ?? '~/projects')
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    await updateSettings({ defaultWorkingDirectoryBase: workDir.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">DEFAULT WORKING DIRECTORY</div>
        <p className="text-[11px] text-text-dim mb-3">
          Base directory for new project working directories. Each project will get a subdirectory under this path.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 h-9 bg-deep px-3 border-2 border-border-dim shadow-pixel-sunken">
            <span className="text-[11px] text-text-dim shrink-0">{'\u{1F4C1}'}</span>
            <input
              type="text"
              value={workDir}
              onChange={e => setWorkDir(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-text-primary font-mono outline-none"
            />
          </div>
          <PixelButton variant="primary" size="sm" onClick={handleSave}>
            Save
          </PixelButton>
        </div>
        {saved && <span className="text-[11px] text-accent-green mt-2 block">Saved!</span>}
      </PixelCard>
    </div>
  )
}

