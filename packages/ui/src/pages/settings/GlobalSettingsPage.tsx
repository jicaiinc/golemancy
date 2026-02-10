import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { AIProvider, ProviderConfig, ThemeMode } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { PixelCard, PixelButton, PixelInput, PixelTabs } from '../../components'

const SETTINGS_TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'profile', label: 'Profile' },
  { id: 'paths', label: 'Paths' },
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
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'paths' && <PathsTab />}
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

// ========== General Tab ==========
function GeneralTab() {
  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">ABOUT</div>
        <div className="text-[12px] text-text-primary">SoloCraft</div>
        <div className="text-[11px] text-text-dim mt-1">v0.1.0</div>
        <div className="text-[11px] text-text-dim mt-1">AI Agent Orchestrator for Solo Creators</div>
      </PixelCard>
    </div>
  )
}
