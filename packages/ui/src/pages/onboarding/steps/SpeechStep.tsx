import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { SpeechToTextSettings } from '@golemancy/shared'
import { PixelCard, PixelButton, PixelInput, PixelToggle } from '../../../components'

const OPENAI_STT_MODELS = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1']

// Language names are in their native scripts — not translated per guidelines
const STT_LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '\u4E2D\u6587' },
  { code: 'ja', label: '\u65E5\u672C\u8A9E' },
  { code: 'ko', label: '\uD55C\uAD6D\uC5B4' },
  { code: 'es', label: 'Espa\u00F1ol' },
  { code: 'fr', label: 'Fran\u00E7ais' },
  { code: 'de', label: 'Deutsch' },
]

interface SpeechStepProps {
  sttEnabled: boolean
  sttApiKey: string
  sttModel: string
  sttLanguage: string
  onUpdate: (data: {
    sttEnabled?: boolean
    sttApiKey?: string
    sttModel?: string
    sttLanguage?: string
    sttTestStatus?: 'untested' | 'testing' | 'ok' | 'error'
  }) => void
  onTestSpeech: (config: SpeechToTextSettings) => Promise<{ ok: boolean; error?: string; latencyMs?: number }>
}

export function SpeechStep({
  sttEnabled,
  sttApiKey,
  sttModel,
  sttLanguage,
  onUpdate,
  onTestSpeech,
}: SpeechStepProps) {
  const { t } = useTranslation(['onboarding', 'common'])
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<'untested' | 'ok' | 'error'>('untested')
  const [testError, setTestError] = useState('')
  const [testLatency, setTestLatency] = useState(0)

  const runTest = useCallback(async () => {
    setTesting(true)
    setTestError('')
    onUpdate({ sttTestStatus: 'testing' })
    try {
      const config: SpeechToTextSettings = {
        enabled: true,
        providerType: 'openai',
        apiKey: sttApiKey || undefined,
        model: sttModel,
        language: sttLanguage || undefined,
      }
      const result = await onTestSpeech(config)
      if (result.ok) {
        setTestStatus('ok')
        setTestLatency(result.latencyMs ?? 0)
        onUpdate({ sttTestStatus: 'ok' })
      } else {
        setTestStatus('error')
        setTestError(result.error ?? t('error.unknownError'))
        onUpdate({ sttTestStatus: 'error' })
      }
    } catch (err) {
      setTestStatus('error')
      setTestError(err instanceof Error ? err.message : t('error.testFailed'))
      onUpdate({ sttTestStatus: 'error' })
    } finally {
      setTesting(false)
    }
  }, [sttApiKey, sttModel, sttLanguage, onTestSpeech, onUpdate, t])

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="font-pixel text-[14px] text-text-primary mb-2">{t('speech.heading')}</h2>
        <p className="font-mono text-[11px] text-text-dim">{t('speech.description')}</p>
      </div>

      <PixelCard>
        <div className="flex items-center gap-3 mb-4">
          <PixelToggle
            checked={sttEnabled}
            onChange={checked => onUpdate({ sttEnabled: checked })}
            label={sttEnabled ? t('common:label.enabled') : t('common:label.disabled')}
          />
        </div>

        {sttEnabled && (
          <div className="flex flex-col gap-3 pt-3 border-t-2 border-border-dim">
            {/* API Key */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <PixelInput
                  label={t('speech.labelApiKey')}
                  type={showKey ? 'text' : 'password'}
                  value={sttApiKey}
                  onChange={e => { onUpdate({ sttApiKey: e.target.value, sttTestStatus: 'untested' }); setTestStatus('untested') }}
                  placeholder="sk-..."
                />
              </div>
              <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                {showKey ? t('button.hide') : t('button.show')}
              </PixelButton>
            </div>

            {/* Model */}
            <div>
              <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('speech.labelModel')}</label>
              <select
                value={sttModel}
                onChange={e => { onUpdate({ sttModel: e.target.value, sttTestStatus: 'untested' }); setTestStatus('untested') }}
                className="w-full h-9 bg-deep px-3 font-mono text-[12px] text-text-primary border-2 border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer"
              >
                {OPENAI_STT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Language */}
            <div>
              <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('speech.labelLanguage')}</label>
              <select
                value={sttLanguage}
                onChange={e => onUpdate({ sttLanguage: e.target.value })}
                className="w-full h-9 bg-deep px-3 font-mono text-[12px] text-text-primary border-2 border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer"
              >
                {STT_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>
                    {l.code ? `${l.label} (${l.code})` : l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Test */}
            <div className="flex items-center gap-2">
              <PixelButton
                size="sm"
                variant={testStatus === 'ok' ? 'ghost' : 'secondary'}
                onClick={runTest}
                disabled={testing || !sttApiKey}
              >
                {testing ? t('button.testing') : testStatus === 'ok' ? t('button.reTest') : t('button.test')}
              </PixelButton>
              {testing && <span className="text-[10px] text-accent-blue animate-pulse">{t('button.testing')}</span>}
              {testStatus === 'ok' && (
                <span className="text-[10px] text-accent-green">
                  {testLatency > 0 ? t('speech.statusOkLatency', { ms: testLatency }) : t('speech.statusOk')}
                </span>
              )}
              {testStatus === 'error' && !testing && <span className="text-[10px] text-accent-red">{t('speech.statusFailed')}</span>}
            </div>
            {testStatus === 'error' && testError && (
              <div className="p-2 bg-accent-red/10 border-2 border-accent-red/30">
                <span className="text-[10px] text-accent-red font-mono break-all">{testError}</span>
              </div>
            )}
          </div>
        )}
      </PixelCard>
    </div>
  )
}
