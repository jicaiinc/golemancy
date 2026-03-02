import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { EmbeddingSettings } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { PixelCard, PixelButton, PixelInput, PixelToggle } from '../../components'

const EMBEDDING_MODELS = ['text-embedding-3-small', 'text-embedding-3-large']

export function EmbeddingTab() {
  const { t } = useTranslation('settings')
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)

  const embedding = settings?.embedding ?? { enabled: false, model: 'text-embedding-3-small' }
  const providers = settings?.providers ?? {}

  // Prefill: use OpenAI provider's API key if available and embedding apiKey is not set
  const openaiKey = providers['openai']?.apiKey ?? ''
  const prefillKey = embedding.apiKey ?? openaiKey

  const [enabled, setEnabled] = useState(embedding.enabled)
  const [model, setModel] = useState(embedding.model || 'text-embedding-3-small')
  const [apiKey, setApiKey] = useState(prefillKey)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setEnabled(embedding.enabled)
    setModel(embedding.model || 'text-embedding-3-small')
    setApiKey(embedding.apiKey ?? openaiKey)
  }, [embedding.enabled, embedding.model, embedding.apiKey, openaiKey])

  async function handleSave() {
    setSaving(true)
    const updated: EmbeddingSettings = {
      enabled,
      model,
      apiKey: apiKey.trim() || undefined,
    }
    await updateSettings({ embedding: updated })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <PixelCard>
        <div className="font-pixel text-[10px] text-text-secondary mb-3">{t('embedding.sectionTitle')}</div>
        <p className="text-[11px] text-text-dim mb-4">{t('embedding.description')}</p>

        {/* Enabled toggle */}
        <div className="flex items-center gap-3 mb-4">
          <PixelToggle checked={enabled} onChange={setEnabled} />
          <span className="text-[12px] text-text-primary">{t('embedding.enableLabel')}</span>
        </div>

        {/* Model selector */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('embedding.modelLabel')}</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={!enabled}
              className="w-full h-9 bg-deep px-3 text-[12px] text-text-primary font-mono border-2 border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none disabled:opacity-50"
            >
              {EMBEDDING_MODELS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <PixelInput
                label={t('embedding.apiKeyLabel')}
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                disabled={!enabled}
              />
            </div>
            <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
              {showKey ? t('provider.hide') : t('provider.show')}
            </PixelButton>
          </div>
          {!embedding.apiKey && openaiKey && (
            <p className="text-[10px] text-text-dim">{t('embedding.prefillHint')}</p>
          )}

          {/* Save */}
          <div className="flex items-center gap-2">
            <PixelButton size="sm" variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? t('common:button.saving') : t('common:button.save')}
            </PixelButton>
            {saved && <span className="text-[11px] text-accent-green">{t('embedding.saved')}</span>}
          </div>
        </div>
      </PixelCard>
    </div>
  )
}
