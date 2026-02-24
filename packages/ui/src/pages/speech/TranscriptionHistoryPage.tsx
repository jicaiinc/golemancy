import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import type { TranscriptionRecord, TranscriptionId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { getServices } from '../../services'
import { PixelCard, PixelButton, PixelSpinner, CopyIcon, CheckIcon, CloseSmallIcon } from '../../components'
import { GlobalLayout } from '../../app/layouts/GlobalLayout'
import { staggerContainer, staggerItem } from '../../lib/motion'

// ---- Inline pixel-art SVG icons ----

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

// ---- Format helpers ----

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function groupByDate(records: TranscriptionRecord[]): [string, TranscriptionRecord[]][] {
  const groups = new Map<string, TranscriptionRecord[]>()
  for (const record of records) {
    const group = getDateGroup(record.createdAt)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(record)
  }
  return Array.from(groups.entries())
}

// ---- Inline Audio Player ----

interface InlineAudioPlayerProps {
  audioUrl: string
  durationMs: number
  onClose: () => void
}

function InlineAudioPlayer({ audioUrl, durationMs, onClose }: InlineAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(durationMs / 1000)

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      void audio.play()
    }
    setPlaying(!playing)
  }

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (audio) setCurrentTime(audio.currentTime)
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (audio && audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration)
    }
  }

  function handleEnded() {
    setPlaying(false)
    setCurrentTime(0)
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    const time = Number(e.target.value)
    audio.currentTime = time
    setCurrentTime(time)
  }

  function formatSecs(s: number): string {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
      <div className="mt-2 pt-2 border-t-2 border-border-dim flex items-center gap-3">
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
        <button
          onClick={togglePlay}
          title={playing ? 'Pause' : 'Play'}
          className="w-8 h-8 flex items-center justify-center border-2 border-border-dim bg-deep hover:border-border-bright text-text-primary transition-colors cursor-pointer flex-shrink-0"
        >
          {playing
            ? <PauseIcon />
            : <PlayIcon />
          }
        </button>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="flex-1 h-1.5 cursor-pointer accent-accent-green"
          style={{ accentColor: 'var(--color-accent-green)' }}
        />
        <span className="font-mono text-[11px] text-text-secondary whitespace-nowrap flex-shrink-0">
          {formatSecs(currentTime)} / {formatSecs(duration)}
        </span>
        <button
          onClick={onClose}
          title="Close player"
          className="text-text-dim hover:text-text-primary transition-colors cursor-pointer flex-shrink-0"
        >
          <CloseSmallIcon />
        </button>
      </div>
    </motion.div>
  )
}

// ---- Record Card ----

interface RecordCardProps {
  record: TranscriptionRecord
  onRetry: (id: TranscriptionId) => Promise<void>
  onDelete: (id: TranscriptionId) => Promise<void>
}

function RecordCard({ record, onRetry, onDelete }: RecordCardProps) {
  const [showPlayer, setShowPlayer] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const audioUrl = getServices().speech.getAudioUrl(record.audioFileId)

  async function handleCopy() {
    if (!record.text) return
    await navigator.clipboard.writeText(record.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete(record.id)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleRetry() {
    setRetrying(true)
    try {
      await onRetry(record.id)
    } finally {
      setRetrying(false)
    }
  }

  const statusIcon =
    record.status === 'success' ? (
      <span className="text-accent-green">✅</span>
    ) : record.status === 'failed' ? (
      <span className="text-accent-red">❌</span>
    ) : (
      <span className="text-accent-amber animate-[pixel-pulse_1s_steps(2)_infinite]">⏳</span>
    )

  return (
    <motion.div variants={staggerItem}>
      <PixelCard variant="interactive" className="py-3 px-3">
        {/* Row 1: Status + Duration + Preview */}
        <div className="flex items-start gap-2 min-w-0">
          <span className="flex-shrink-0 text-[14px] leading-none mt-0.5">{statusIcon}</span>
          <span className="font-mono text-[12px] text-text-secondary flex-shrink-0 tabular-nums">
            {formatDuration(record.audioDurationMs)}
          </span>
          <span className="font-mono text-[12px] flex-1 min-w-0 truncate">
            {record.status === 'success' && record.text && (
              <span className="text-text-primary">"{record.text}"</span>
            )}
            {record.status === 'failed' && (
              <span className="text-accent-red">Transcription failed: {record.error}</span>
            )}
            {record.status === 'pending' && (
              <span className="text-accent-amber">Transcribing...</span>
            )}
          </span>
        </div>

        {/* Row 2: Metadata + Actions */}
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-[11px] text-text-dim flex-1 min-w-0 truncate">
            {record.provider} / {record.model}
          </span>
          <span className="font-mono text-[10px] text-text-dim flex-shrink-0">
            {formatTime(record.createdAt)}
          </span>
          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Play / stop player toggle */}
            <button
              onClick={() => setShowPlayer(v => !v)}
              title={showPlayer ? 'Close player' : 'Play audio'}
              className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text-primary transition-colors cursor-pointer"
            >
              {showPlayer ? <PauseIcon /> : <PlayIcon />}
            </button>
            {/* Copy — only for success */}
            {record.status === 'success' && record.text && (
              <button
                onClick={handleCopy}
                title="Copy transcribed text"
                className="w-6 h-6 flex items-center justify-center transition-colors cursor-pointer"
              >
                {copied
                  ? <CheckIcon className="text-accent-green" />
                  : <CopyIcon className="text-text-dim hover:text-text-primary" />
                }
              </button>
            )}
            {/* Retry — only for failed */}
            {record.status === 'failed' && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                title="Retry transcription"
                className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-accent-amber transition-colors cursor-pointer disabled:opacity-50"
              >
                {retrying
                  ? <PixelSpinner size="sm" />
                  : <RetryIcon />
                }
              </button>
            )}
            {/* Delete */}
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete record"
              className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-accent-red transition-colors cursor-pointer"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        <AnimatePresence>
          {confirmDelete && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.1 }}
              className="overflow-hidden"
            >
              <div className="mt-2 p-2 bg-accent-red/10 border-2 border-accent-red/30 flex items-center gap-3">
                <span className="text-[11px] text-accent-red flex-1">Delete this record and its audio file?</span>
                <PixelButton
                  size="sm"
                  variant="danger"
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleting ? '...' : 'Confirm'}
                </PixelButton>
                <PixelButton
                  size="sm"
                  variant="ghost"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </PixelButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline audio player */}
        <AnimatePresence>
          {showPlayer && (
            <InlineAudioPlayer
              audioUrl={audioUrl}
              durationMs={record.audioDurationMs}
              onClose={() => setShowPlayer(false)}
            />
          )}
        </AnimatePresence>
      </PixelCard>
    </motion.div>
  )
}

// ---- Main Page ----

export function TranscriptionHistoryPage() {
  const navigate = useNavigate()
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

  useEffect(() => {
    void loadSpeechHistory()
    void loadSpeechStorageUsage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function handleDelete(id: TranscriptionId) {
    await deleteSpeechRecord(id)
    await loadSpeechStorageUsage()
  }

  async function handleRetry(id: TranscriptionId) {
    await retrySpeechRecord(id)
  }

  const grouped = groupByDate(speechHistory)

  return (
    <GlobalLayout>
      <div className="max-w-[1000px] mx-auto p-8">
        {/* Page heading */}
        <h2 className="font-pixel text-[12px] text-text-primary mb-6">Transcription History</h2>

        {/* Storage usage header */}
        <PixelCard className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[16px]">📊</span>
            {speechStorageUsage != null ? (
              <>
                <span className="font-mono text-[12px] text-text-primary">
                  {speechStorageUsage.recordCount} {speechStorageUsage.recordCount === 1 ? 'record' : 'records'}
                </span>
                <span className="text-text-dim">•</span>
                <span className="font-mono text-[12px] text-text-secondary">
                  {formatBytes(speechStorageUsage.totalBytes)} used
                </span>
              </>
            ) : (
              <span className="font-mono text-[12px] text-text-dim">Loading storage info...</span>
            )}
            <div className="ml-auto">
              <AnimatePresence mode="wait">
                {confirmClearAll ? (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-[11px] text-accent-red">
                      Delete all {speechStorageUsage?.recordCount ?? 0} records
                      {speechStorageUsage && speechStorageUsage.totalBytes > 0
                        ? ` and free ${formatBytes(speechStorageUsage.totalBytes)}`
                        : ''
                      }?
                    </span>
                    <PixelButton
                      size="sm"
                      variant="danger"
                      disabled={clearingAll}
                      onClick={handleClearAll}
                    >
                      {clearingAll ? '...' : 'Confirm'}
                    </PixelButton>
                    <PixelButton
                      size="sm"
                      variant="ghost"
                      disabled={clearingAll}
                      onClick={() => setConfirmClearAll(false)}
                    >
                      Cancel
                    </PixelButton>
                  </motion.div>
                ) : (
                  <motion.div
                    key="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    <PixelButton
                      size="sm"
                      variant="danger"
                      disabled={!speechHistory.length}
                      onClick={() => setConfirmClearAll(true)}
                    >
                      Clear All
                    </PixelButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </PixelCard>

        {/* Loading state */}
        {speechHistoryLoading ? (
          <div className="flex items-center justify-center py-16">
            <PixelSpinner label="Loading history..." />
          </div>
        ) : speechHistory.length === 0 ? (
          /* Empty state */
          <PixelCard variant="outlined" className="py-12">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="text-[48px]">🎤</div>
              <div className="font-pixel text-[10px] text-text-secondary">No transcriptions yet</div>
              <p className="font-mono text-[12px] text-text-dim leading-relaxed">
                Use the microphone button in chat<br />
                to create your first voice recording
              </p>
              <PixelButton
                size="sm"
                variant="secondary"
                onClick={() => void navigate('/settings')}
              >
                Go to Settings
              </PixelButton>
            </div>
          </PixelCard>
        ) : (
          /* Records grouped by date */
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="flex flex-col gap-6"
          >
            {grouped.map(([group, records]) => (
              <div key={group}>
                {/* Date group header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-pixel text-[9px] text-text-dim whitespace-nowrap">{group}</span>
                  <div className="flex-1 border-t-2 border-border-dim" />
                </div>
                {/* Record cards */}
                <div className="flex flex-col gap-2">
                  {records.map(record => (
                    <RecordCard
                      key={record.id}
                      record={record}
                      onRetry={handleRetry}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </GlobalLayout>
  )
}
