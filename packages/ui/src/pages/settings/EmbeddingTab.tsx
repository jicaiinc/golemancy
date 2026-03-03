import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import type { EmbeddingSettings, EmbeddingProviderType } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { getServices } from '../../services'
import { PixelCard, PixelButton, PixelInput } from '../../components'

const OPENAI_MODELS = ['text-embedding-3-small', 'text-embedding-3-large']

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      className={`transition-transform duration-150 ${open ? 'rotate-90' : ''} ${className ?? ''}`}
    >
      <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function EmbeddingTab() {
  const { t } = useTranslation('settings')
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)

  const embedding = settings?.embedding
  const embeddingRef = useRef(embedding)
  embeddingRef.current = embedding

  const providers = settings?.providers ?? {}
  const openaiKey = providers['openai']?.apiKey ?? ''

  const [apiKey, setApiKey] = useState(embedding?.apiKey ?? openaiKey)
  const [baseUrl, setBaseUrl] = useState(embedding?.baseUrl ?? '')
  const [model, setModel] = useState(embedding?.model || 'text-embedding-3-small')
  const [showKey, setShowKey] = useState(false)
  const [useCustomModel, setUseCustomModel] = useState(
    embedding?.providerType === 'openai-compatible' || (!!embedding?.model && !OPENAI_MODELS.includes(embedding.model)),
  )
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const [testLatency, setTestLatency] = useState(0)
  const [providerOpen, setProviderOpen] = useState(true)

  const testStatus = embedding?.testStatus ?? 'untested'
  const isCustomProvider = embedding?.providerType === 'openai-compatible'

  useEffect(() => {
    setApiKey(embedding?.apiKey ?? openaiKey)
    setBaseUrl(embedding?.baseUrl ?? '')
    setModel(embedding?.model || 'text-embedding-3-small')
    setUseCustomModel(
      embedding?.providerType === 'openai-compatible' || (!!embedding?.model && !OPENAI_MODELS.includes(embedding.model)),
    )
  }, [embedding?.providerType, embedding?.model, embedding?.apiKey, embedding?.baseUrl, openaiKey])

  const save = useCallback(
    async (patch: Partial<EmbeddingSettings>) => {
      const current = embeddingRef.current
      const updated: EmbeddingSettings = {
        providerType: current?.providerType ?? 'openai',
        model: current?.model || 'text-embedding-3-small',
        ...current,
        ...patch,
      }
      await updateSettings({ embedding: updated })
    },
    [updateSettings],
  )

  async function handleProviderTypeChange(type: EmbeddingProviderType) {
    const patch: Partial<EmbeddingSettings> = { providerType: type, testStatus: 'untested' }
    if (type === 'openai-compatible') {
      setUseCustomModel(true)
    } else {
      setUseCustomModel(false)
      setBaseUrl('')
      patch.baseUrl = undefined
      if (!OPENAI_MODELS.includes(model)) {
        const newModel = OPENAI_MODELS[0]
        setModel(newModel)
        patch.model = newModel
      }
    }
    await save(patch)
  }

  async function handleModelSelect(value: string) {
    if (value === '__custom__') {
      setUseCustomModel(true)
    } else {
      setModel(value)
      await save({ model: value, testStatus: 'untested' })
    }
  }

  async function handleApiKeyBlur() { await save({ apiKey: apiKey.trim() || undefined, testStatus: 'untested' }) }
  async function handleBaseUrlBlur() { await save({ baseUrl: baseUrl.trim() || undefined, testStatus: 'untested' }) }
  async function handleCustomModelBlur() { if (model.trim()) await save({ model: model.trim(), testStatus: 'untested' }) }

  const runTest = useCallback(async () => {
    setTesting(true)
    setTestError('')
    try {
      const current = embeddingRef.current
      const result = await getServices().settings.testEmbedding({
        apiKey: apiKey.trim(),
        model,
        baseUrl: baseUrl.trim() || undefined,
        providerType: current?.providerType ?? 'openai',
      })
      if (result.ok) {
        setTestLatency(result.latencyMs ?? 0)
        await save({ testStatus: 'ok' })
      } else {
        setTestError(result.error ?? t('embedding.test.unknownError'))
        await save({ testStatus: 'error' })
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : t('embedding.test.failed'))
      await save({ testStatus: 'error' })
    } finally {
      setTesting(false)
    }
  }, [apiKey, baseUrl, model, save, t])

  const providerType = embedding?.providerType ?? 'openai'

  return (
    <div className="flex flex-col gap-2">
      <PixelCard className="!py-0 !px-0 overflow-hidden">
        {/* Summary row — always visible, clickable to toggle */}
        <button
          onClick={() => setProviderOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-elevated/30 transition-colors cursor-pointer"
        >
          <ChevronIcon open={providerOpen} className="text-text-dim" />
          <span className="font-pixel text-[8px] text-text-secondary">{t('embedding.provider.sectionTitle')}</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[10px] text-text-dim">
              {providerType === 'openai' ? 'OpenAI' : 'Custom'} / {embedding?.model || 'text-embedding-3-small'}
            </span>
            {testStatus === 'ok' && <span className="w-1.5 h-1.5 bg-accent-green rounded-full" />}
            {testStatus === 'error' && <span className="w-1.5 h-1.5 bg-accent-red rounded-full" />}
            {testStatus === 'untested' && <span className="w-1.5 h-1.5 bg-text-dim/40 rounded-full" />}
          </span>
        </button>

        {/* Expandable form */}
        <AnimatePresence initial={false}>
          {providerOpen && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 px-3 pb-3 border-t border-border-dim pt-3">
                {/* Provider Type */}
                <div>
                  <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('embedding.provider.typeLabel')}</label>
                  <select
                    value={providerType}
                    onChange={e => handleProviderTypeChange(e.target.value as EmbeddingProviderType)}
                    className="w-full h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="openai-compatible">{t('embedding.provider.customType')}</option>
                  </select>
                </div>

                {/* API Key */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <PixelInput label={t('embedding.provider.apiKeyLabel')} type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} onBlur={handleApiKeyBlur} placeholder="sk-..." />
                  </div>
                  <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>{showKey ? t('embedding.provider.hide') : t('embedding.provider.show')}</PixelButton>
                </div>
                {!embedding?.apiKey && openaiKey && (
                  <p className="text-[10px] text-text-dim -mt-2">{t('embedding.provider.prefillHint')}</p>
                )}

                {/* Base URL */}
                <PixelInput
                  label={isCustomProvider ? t('embedding.provider.baseUrlRequired') : t('embedding.provider.baseUrlOptional')}
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  onBlur={handleBaseUrlBlur}
                  placeholder={isCustomProvider ? 'https://api.example.com/v1' : t('embedding.provider.baseUrlPlaceholder')}
                />

                {/* Model */}
                <div>
                  <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('embedding.provider.modelLabel')}</label>
                  {isCustomProvider || useCustomModel ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={model} onChange={e => setModel(e.target.value)} onBlur={handleCustomModelBlur} placeholder="model-id" className="flex-1 h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none" />
                      {!isCustomProvider && (
                        <button onClick={() => { setUseCustomModel(false); const p = OPENAI_MODELS[0]; setModel(p); save({ model: p, testStatus: 'untested' }) }} className="text-[9px] text-accent-blue hover:text-text-primary cursor-pointer whitespace-nowrap">{t('embedding.provider.presets')}</button>
                      )}
                    </div>
                  ) : (
                    <select value={OPENAI_MODELS.includes(model) ? model : '__custom__'} onChange={e => handleModelSelect(e.target.value)} className="w-full h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer">
                      {OPENAI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                      <option value="__custom__">{t('embedding.provider.modelOther')}</option>
                    </select>
                  )}
                </div>

                {/* Test */}
                <div className="flex items-center gap-2">
                  <PixelButton size="sm" variant={testStatus === 'ok' ? 'ghost' : 'secondary'} onClick={runTest} disabled={testing}>
                    {testing ? '...' : testStatus === 'ok' ? t('embedding.test.retest') : t('embedding.test.test')}
                  </PixelButton>
                  {testing ? (
                    <span className="text-[9px] text-accent-blue animate-pulse">{t('embedding.test.testing')}</span>
                  ) : testStatus === 'ok' ? (
                    <span className="text-[9px] text-accent-green">{testLatency > 0 ? t('embedding.test.okLatency', { latency: testLatency }) : t('embedding.test.ok')}</span>
                  ) : testStatus === 'error' ? (
                    <span className="text-[9px] text-accent-red">{t('embedding.test.failed')}</span>
                  ) : (
                    <span className="text-[9px] text-text-dim">{t('embedding.test.untested')}</span>
                  )}
                </div>
                {!testing && testStatus === 'error' && testError && (
                  <div className="p-1.5 bg-accent-red/10 border border-accent-red/30">
                    <span className="text-[9px] text-accent-red font-mono break-all">{testError}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PixelCard>
    </div>
  )
}
