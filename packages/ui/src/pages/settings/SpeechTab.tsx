import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import type { SpeechToTextSettings, TranscriptionRecord, TranscriptionId, ProjectId, ConversationId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { getServices } from '../../services'
import { PixelCard, PixelButton, PixelInput, PixelToggle, PixelSpinner, CopyIcon, CheckIcon } from '../../components'
// stagger presets removed — history loads all at once

const OPENAI_STT_MODELS = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1']

/** ISO 639-1 languages supported by OpenAI transcription models. */
const STT_LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'no', label: 'Norsk' },
  { code: 'uk', label: 'Українська' },
  { code: 'cs', label: 'Čeština' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'he', label: 'עברית' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'ro', label: 'Română' },
  { code: 'hu', label: 'Magyar' },
  { code: 'bg', label: 'Български' },
  { code: 'hr', label: 'Hrvatski' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'ca', label: 'Català' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'cy', label: 'Cymraeg' },
  { code: 'sw', label: 'Kiswahili' },
]

const DEFAULT_SPEECH_SETTINGS: SpeechToTextSettings = {
  enabled: false,
  providerType: 'openai',
  model: OPENAI_STT_MODELS[0],
}

// ---- Inline icons ----

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className}>
      <path d="M3 1L10 6L3 11V1Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className}>
      <rect x="2" y="1" width="3" height="10" fill="currentColor" />
      <rect x="7" y="1" width="3" height="10" fill="currentColor" />
    </svg>
  )
}

function RetryIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className}>
      <path d="M9 6A3 3 0 1 1 6 3" stroke="currentColor" strokeWidth="2" />
      <path d="M6 1L9 4H6" fill="currentColor" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className}>
      <rect x="1" y="3" width="10" height="1" fill="currentColor" />
      <path d="M2 4L3 11H9L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 4V2H8V4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

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

// ---- Format helpers ----

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function getDateGroupKey(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'today'
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupByDate(records: TranscriptionRecord[]): [string, TranscriptionRecord[]][] {
  const groups = new Map<string, TranscriptionRecord[]>()
  for (const record of records) {
    const group = getDateGroupKey(record.createdAt)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(record)
  }
  return Array.from(groups.entries())
}

// ---- Inline Audio Player ----

/** Inline audio player — renders play button + progress bar + time. No wrapper — caller provides layout. */
function InlineAudioPlayer({ audioUrl, durationMs }: { audioUrl: string; durationMs: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(durationMs > 0 ? durationMs / 1000 : 0)

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '--:--'
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  function updateDuration() {
    const a = audioRef.current
    if (a && isFinite(a.duration) && a.duration > 0) setDuration(a.duration)
  }

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation()
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { void a.play(); setPlaying(true) }
  }

  useEffect(() => {
    const a = audioRef.current
    return () => { if (a) a.pause() }
  }, [])

  return (
    <>
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onTimeUpdate={() => { audioRef.current && setCurrentTime(audioRef.current.currentTime); updateDuration() }}
        onLoadedMetadata={updateDuration}
        onDurationChange={updateDuration}
        onEnded={() => { setPlaying(false); setCurrentTime(0) }}
      />
      <button onClick={togglePlay} className="w-6 h-6 flex items-center justify-center border border-border-dim bg-deep hover:border-border-bright text-text-primary transition-colors cursor-pointer shrink-0">
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <input type="range" min={0} max={duration || 1} step={0.1} value={currentTime} onChange={e => { e.stopPropagation(); const a = audioRef.current; if (a) { a.currentTime = Number(e.target.value); setCurrentTime(a.currentTime) } }} className="flex-1 h-1 cursor-pointer accent-accent-green" style={{ accentColor: 'var(--color-accent-green)' }} />
      <span className="font-mono text-[10px] text-text-secondary whitespace-nowrap shrink-0">{fmt(currentTime)}/{fmt(duration)}</span>
    </>
  )
}

// ---- Record Row ----

function RecordRow({ record, onRetry, onDelete, convTitleMap }: { record: TranscriptionRecord; onRetry: (id: TranscriptionId) => Promise<void>; onDelete: (id: TranscriptionId) => Promise<void>; convTitleMap: Record<string, string> }) {
  const { t } = useTranslation('speech')
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRetry, setConfirmRetry] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const navigate = useNavigate()
  const projects = useAppStore(s => s.projects)
  const audioUrl = getServices().speech.getAudioUrl(record.audioFileId)
  const canRetry = (record.status === 'success' || record.status === 'failed') && !retrying
  const hasConversationLink = record.projectId && record.conversationId
  const projectName = record.projectId ? projects.find(p => p.id === record.projectId)?.name : undefined
  const convTitle = record.conversationId ? convTitleMap[record.conversationId] : undefined

  async function doRetry() {
    setRetrying(true)
    setConfirmRetry(false)
    try { await onRetry(record.id) } finally { setRetrying(false) }
  }

  return (
    <div>
      <div className="py-1.5 px-2 border border-border-dim bg-surface hover:bg-deep/50 transition-colors cursor-pointer" onClick={() => setExpanded(v => !v)}>
        {/* Main row */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-[11px] leading-none">
            {record.status === 'success' ? <span className="text-accent-green">{t('record.statusOk')}</span> : record.status === 'failed' ? <span className="text-accent-red">{t('record.statusErr')}</span> : <span className="text-accent-amber">...</span>}
          </span>
          <span className="font-mono text-[10px] text-text-dim shrink-0 tabular-nums">{formatDuration(record.audioDurationMs)}</span>
          <span className={`font-mono text-[11px] flex-1 min-w-0 ${expanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
            {retrying ? (
              <span className="text-accent-amber animate-pulse">{t('history.transcribing')}</span>
            ) : record.status === 'success' && record.text ? (
              <span className="text-text-primary">{record.text}</span>
            ) : record.status === 'failed' ? (
              <span className="text-accent-red">{record.error}</span>
            ) : (
              <span className="text-accent-amber">{t('history.transcribing')}</span>
            )}
          </span>
          {!expanded && <span className="font-mono text-[9px] text-text-dim shrink-0">{formatTime(record.createdAt)}</span>}
          {/* Actions — stop propagation so clicks don't toggle the row */}
          <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
            {record.status === 'success' && record.text && (
              <button onClick={async () => { await navigator.clipboard.writeText(record.text!); setCopied(true); setTimeout(() => setCopied(false), 1500) }} title={t('common:button.copy')} className="w-5 h-5 flex items-center justify-center transition-colors cursor-pointer">
                {copied ? <CheckIcon className="text-accent-green" /> : <CopyIcon className="text-text-dim hover:text-text-primary" />}
              </button>
            )}
            <button onClick={() => setConfirmDelete(true)} title={t('common:button.delete')} className="w-5 h-5 flex items-center justify-center text-text-dim hover:text-accent-red transition-colors cursor-pointer">
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* Expanded area */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Player row: [play/pause] [progress] [time] [retry icon] */}
              <div className="mt-1.5 pt-1.5 border-t border-border-dim flex items-center gap-2">
                <InlineAudioPlayer audioUrl={audioUrl} durationMs={record.audioDurationMs} />
                {/* Retry icon button — inline with player */}
                {retrying ? (
                  <PixelSpinner size="sm" />
                ) : canRetry ? (
                  <button
                    onClick={() => record.status === 'failed' ? void doRetry() : setConfirmRetry(true)}
                    title={t('record.retranscribe')}
                    className="shrink-0 w-6 h-6 flex items-center justify-center text-text-dim hover:text-accent-amber transition-colors cursor-pointer"
                  >
                    <RetryIcon />
                  </button>
                ) : null}
              </div>

              {/* Metadata row: [time / provider / model] ... [project > conv title] [Open chat →] */}
              <div className="mt-1 flex items-center gap-2 min-w-0">
                <span className="font-mono text-[9px] text-text-dim shrink-0">{formatTime(record.createdAt)} / {record.provider} / {record.model}</span>
                {hasConversationLink && (
                  <div className="ml-auto flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[9px] text-text-dim truncate max-w-[200px]">
                      {projectName ?? '...'}{convTitle ? ` / ${convTitle}` : ''}
                    </span>
                    <button
                      onClick={() => navigate(`/projects/${record.projectId}/chat?conv=${record.conversationId}`)}
                      className="font-mono text-[9px] text-accent-blue hover:text-accent-blue/70 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {t('history.openChat')}
                    </button>
                  </div>
                )}
              </div>

              {/* Retry confirm */}
              <AnimatePresence>
                {confirmRetry && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.1 }} className="overflow-hidden">
                    <div className="mt-1 p-1.5 bg-accent-amber/10 border border-accent-amber/30 flex items-center gap-2">
                      <span className="text-[10px] text-accent-amber flex-1">{t('record.retryConfirm')}</span>
                      <PixelButton size="sm" variant="secondary" onClick={() => void doRetry()}>{t('common:button.confirm')}</PixelButton>
                      <PixelButton size="sm" variant="ghost" onClick={() => setConfirmRetry(false)}>{t('common:button.cancel')}</PixelButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete confirm */}
        <AnimatePresence>
          {confirmDelete && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.1 }} className="overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="mt-1 p-1.5 bg-accent-red/10 border border-accent-red/30 flex items-center gap-2">
                <span className="text-[10px] text-accent-red flex-1">{t('record.deleteConfirm')}</span>
                <PixelButton size="sm" variant="danger" disabled={deleting} onClick={async () => { setDeleting(true); try { await onDelete(record.id) } finally { setDeleting(false); setConfirmDelete(false) } }}>
                  {deleting ? '...' : t('common:button.confirm')}
                </PixelButton>
                <PixelButton size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(false)}>{t('common:button.cancel')}</PixelButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ---- Main Component ----

export function SpeechTab() {
  const { t } = useTranslation('speech')
  const settings = useAppStore(s => s.settings)
  const updateSettings = useAppStore(s => s.updateSettings)

  const stt = settings?.speechToText ?? DEFAULT_SPEECH_SETTINGS
  const sttRef = useRef(stt)
  sttRef.current = stt

  // Provider form state — auto-fill from OpenAI provider if STT has no dedicated key
  const openaiApiKey = stt.providerType === 'openai' ? settings?.providers?.openai?.apiKey : undefined
  const [apiKey, setApiKey] = useState(stt.apiKey ?? openaiApiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(stt.baseUrl ?? '')
  const [language, setLanguage] = useState(stt.language ?? '')
  const [model, setModel] = useState(stt.model)
  const [showKey, setShowKey] = useState(false)
  const [useCustomModel, setUseCustomModel] = useState(
    stt.providerType === 'openai-compatible' || !OPENAI_STT_MODELS.includes(stt.model),
  )
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const [testLatency, setTestLatency] = useState(0)
  const [providerOpen, setProviderOpen] = useState(true)

  const testStatus = stt.testStatus ?? 'untested'

  // History state
  const speechHistory = useAppStore(s => s.speechHistory)
  const speechHistoryLoading = useAppStore(s => s.speechHistoryLoading)
  const speechStorageUsage = useAppStore(s => s.speechStorageUsage)
  const loadSpeechHistory = useAppStore(s => s.loadSpeechHistory)
  const loadSpeechStorageUsage = useAppStore(s => s.loadSpeechStorageUsage)
  const retrySpeechRecord = useAppStore(s => s.retrySpeechRecord)
  const deleteSpeechRecord = useAppStore(s => s.deleteSpeechRecord)
  const clearSpeechHistory = useAppStore(s => s.clearSpeechHistory)

  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [convTitleMap, setConvTitleMap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (stt.enabled) {
      void loadSpeechHistory()
      void loadSpeechStorageUsage()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.enabled])

  // Fetch conversation titles for records that have conversationId
  useEffect(() => {
    if (speechHistory.length === 0) return
    // Collect unique projectIds that have conversation links
    const projectIds = new Set<ProjectId>()
    for (const r of speechHistory) {
      if (r.projectId && r.conversationId) projectIds.add(r.projectId as ProjectId)
    }
    if (projectIds.size === 0) return

    let cancelled = false
    void (async () => {
      const map: Record<string, string> = {}
      for (const pid of projectIds) {
        try {
          const convs = await getServices().conversations.list(pid)
          for (const c of convs) map[c.id] = c.title
        } catch { /* project may have been deleted */ }
      }
      if (!cancelled) setConvTitleMap(map)
    })()
    return () => { cancelled = true }
  }, [speechHistory])

  const save = useCallback(
    async (patch: Partial<SpeechToTextSettings>) => {
      const updated = { ...sttRef.current, ...patch }
      await updateSettings({ speechToText: updated })
    },
    [updateSettings],
  )

  async function handleToggleEnabled(checked: boolean) {
    await save({ enabled: checked })
  }

  async function handleProviderTypeChange(type: 'openai' | 'openai-compatible') {
    const patch: Partial<SpeechToTextSettings> = { providerType: type, testStatus: 'untested' }
    if (type === 'openai-compatible') {
      setUseCustomModel(true)
    } else {
      setUseCustomModel(false)
      if (!OPENAI_STT_MODELS.includes(model)) {
        const newModel = OPENAI_STT_MODELS[0]
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

  async function handleApiKeyBlur() { await save({ apiKey: apiKey || undefined, testStatus: 'untested' }) }
  async function handleBaseUrlBlur() { await save({ baseUrl: baseUrl || undefined, testStatus: 'untested' }) }
  async function handleCustomModelBlur() { if (model.trim()) await save({ model: model.trim(), testStatus: 'untested' }) }

  const runTest = useCallback(async () => {
    setTesting(true)
    setTestError('')
    try {
      const config: SpeechToTextSettings = { ...sttRef.current, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined, model, language: language || undefined }
      const result = await getServices().speech.testProvider(config)
      if (result.ok) {
        setTestLatency(result.latencyMs ?? 0)
        await save({ testStatus: 'ok' })
      } else {
        setTestError(result.error ?? t('test.unknownError'))
        await save({ testStatus: 'error' })
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : t('test.failed'))
      await save({ testStatus: 'error' })
    } finally {
      setTesting(false)
    }
  }, [apiKey, baseUrl, model, language, save])

  async function handleDelete(id: TranscriptionId) {
    await deleteSpeechRecord(id)
    await loadSpeechStorageUsage()
  }

  async function handleRetry(id: TranscriptionId) {
    await retrySpeechRecord(id)
  }

  async function handleClearAll() {
    setClearingAll(true)
    try {
      await clearSpeechHistory()
      await loadSpeechStorageUsage()
    } finally {
      setClearingAll(false)
      setConfirmClearAll(false)
    }
  }

  const isCustomProvider = stt.providerType === 'openai-compatible'
  const grouped = groupByDate(speechHistory)

  return (
    <div className="flex flex-col gap-2">
      {/* Enable toggle — compact inline */}
      <div className="flex items-center gap-3 px-1">
        <PixelToggle checked={stt.enabled} onChange={handleToggleEnabled} label={stt.enabled ? t('enable.enabled') : t('enable.disabled')} />
        <span className="font-pixel text-[8px] text-text-dim">{t('enable.sectionTitle')}</span>
      </div>

      {/* Provider Configuration — collapsible */}
      <div className={!stt.enabled ? 'opacity-40 pointer-events-none' : undefined}>
        <PixelCard className="!py-0 !px-0 overflow-hidden">
          {/* Summary row — always visible, clickable to toggle */}
          <button
            onClick={() => setProviderOpen(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-elevated/30 transition-colors cursor-pointer"
          >
            <ChevronIcon open={providerOpen} className="text-text-dim" />
            <span className="font-pixel text-[8px] text-text-secondary">{t('provider.sectionTitle')}</span>
            {/* Config summary when collapsed */}
            <span className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[10px] text-text-dim">
                {stt.providerType === 'openai' ? 'OpenAI' : 'Custom'} / {stt.model}
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
                    <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('provider.typeLabel')}</label>
                    <select
                      value={stt.providerType}
                      onChange={e => handleProviderTypeChange(e.target.value as 'openai' | 'openai-compatible')}
                      className="w-full h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="openai-compatible">{t('provider.customType')}</option>
                    </select>
                  </div>

                  {/* API Key */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <PixelInput label={t('provider.apiKeyLabel')} type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} onBlur={handleApiKeyBlur} placeholder="sk-..." />
                    </div>
                    <PixelButton size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>{showKey ? t('provider.hide') : t('provider.show')}</PixelButton>
                  </div>

                  {/* Base URL */}
                  <PixelInput
                    label={isCustomProvider ? t('provider.baseUrlRequired') : t('provider.baseUrlOptional')}
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    onBlur={handleBaseUrlBlur}
                    placeholder={isCustomProvider ? 'https://api.example.com/v1' : t('provider.baseUrlPlaceholder')}
                  />

                  {/* Model */}
                  <div>
                    <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('provider.modelLabel')}</label>
                    {isCustomProvider || useCustomModel ? (
                      <div className="flex items-center gap-2">
                        <input type="text" value={model} onChange={e => setModel(e.target.value)} onBlur={handleCustomModelBlur} placeholder="model-id" className="flex-1 h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none" />
                        {!isCustomProvider && (
                          <button onClick={() => { setUseCustomModel(false); const p = OPENAI_STT_MODELS[0]; setModel(p); save({ model: p, testStatus: 'untested' }) }} className="text-[9px] text-accent-blue hover:text-text-primary cursor-pointer whitespace-nowrap">{t('provider.presets')}</button>
                        )}
                      </div>
                    ) : (
                      <select value={OPENAI_STT_MODELS.includes(model) ? model : '__custom__'} onChange={e => handleModelSelect(e.target.value)} className="w-full h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer">
                        {OPENAI_STT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                        <option value="__custom__">{t('provider.modelOther')}</option>
                      </select>
                    )}
                  </div>

                  {/* Language */}
                  <div>
                    <label className="font-pixel text-[8px] text-text-dim block mb-1">{t('provider.languageLabel')}</label>
                    <select
                      value={language}
                      onChange={e => { setLanguage(e.target.value); void save({ language: e.target.value || undefined }) }}
                      className="w-full h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border border-border-dim shadow-pixel-sunken focus:border-accent-blue outline-none cursor-pointer"
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
                    <PixelButton size="sm" variant={testStatus === 'ok' ? 'ghost' : 'secondary'} onClick={runTest} disabled={testing}>
                      {testing ? '...' : testStatus === 'ok' ? t('test.retest') : t('test.test')}
                    </PixelButton>
                    {testing ? (
                      <span className="text-[9px] text-accent-blue animate-pulse">{t('test.testing')}</span>
                    ) : testStatus === 'ok' ? (
                      <span className="text-[9px] text-accent-green">{testLatency > 0 ? t('test.okLatency', { latency: testLatency }) : t('test.ok')}</span>
                    ) : testStatus === 'error' ? (
                      <span className="text-[9px] text-accent-red">{t('test.failed')}</span>
                    ) : (
                      <span className="text-[9px] text-text-dim">{t('test.untested')}</span>
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

      {/* History section */}
      {stt.enabled && (
        <div className="flex flex-col gap-1.5 mt-1">
          {/* History header */}
          <div className="flex items-center gap-2 px-1">
            <span className="font-pixel text-[8px] text-text-secondary">{t('history.sectionTitle')}</span>
            {speechStorageUsage != null && (
              <span className="font-mono text-[9px] text-text-dim">
                {t('history.recordsInfo', { recordCount: speechStorageUsage.recordCount, size: formatBytes(speechStorageUsage.totalBytes) })}
              </span>
            )}
            <div className="ml-auto">
              <AnimatePresence mode="wait">
                {confirmClearAll ? (
                  <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="flex items-center gap-1.5">
                    <span className="text-[9px] text-accent-red">{t('history.confirmClear')}</span>
                    <PixelButton size="sm" variant="danger" disabled={clearingAll} onClick={handleClearAll}>{clearingAll ? '...' : t('common:button.confirm')}</PixelButton>
                    <PixelButton size="sm" variant="ghost" disabled={clearingAll} onClick={() => setConfirmClearAll(false)}>{t('common:button.cancel')}</PixelButton>
                  </motion.div>
                ) : (
                  <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
                    <PixelButton size="sm" variant="ghost" disabled={!speechHistory.length} onClick={() => setConfirmClearAll(true)}>{t('history.clearAll')}</PixelButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* History content */}
          {speechHistoryLoading ? (
            <div className="flex items-center justify-center py-8">
              <PixelSpinner label={t('common:status.loading')} />
            </div>
          ) : speechHistory.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-mono text-[11px] text-text-dim">{t('history.empty')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {grouped.map(([group, records]) => (
                <div key={group}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-pixel text-[8px] text-text-dim whitespace-nowrap">
                      {group === 'today' ? t('history.today') : group === 'yesterday' ? t('history.yesterday') : group}
                    </span>
                    <div className="flex-1 border-t border-border-dim" />
                  </div>
                  <div className="flex flex-col gap-1">
                    {records.map(record => (
                      <RecordRow key={record.id} record={record} onRetry={handleRetry} onDelete={handleDelete} convTitleMap={convTitleMap} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
