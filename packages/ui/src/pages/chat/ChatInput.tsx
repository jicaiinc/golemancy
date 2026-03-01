import { useState, useRef, useCallback, type KeyboardEvent, type DragEvent, type ClipboardEvent } from 'react'
import type { FileUIPart } from 'ai'
import type { TranscriptionId, ProjectId, ConversationId } from '@golemancy/shared'
import { useTranslation } from 'react-i18next'
import { PixelButton, PixelSpinner, ImageAttachIcon, CloseSmallIcon, CheckIcon, MicIcon, StopSquareIcon, VoiceWaveform } from '../../components'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { useAppStore } from '../../stores'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

type RecordingState = 'idle' | 'recording' | 'transcribing' | 'error'

interface ChatInputProps {
  onSend: (content: string, files?: FileUIPart[]) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Read File objects as data URLs and convert to FileUIPart[] */
async function filesToFileUIParts(files: File[]): Promise<FileUIPart[]> {
  const parts: FileUIPart[] = []
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`Skipping "${file.name}" — exceeds 10MB limit`)
      continue
    }
    if (!file.type.startsWith('image/')) continue
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    parts.push({ type: 'file', mediaType: file.type, url, filename: file.name })
  }
  return parts
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const { t } = useTranslation(['chat', 'common'])
  const [value, setValue] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<FileUIPart[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const [lastTranscriptionId, setLastTranscriptionId] = useState<TranscriptionId | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { isRecording, durationMs, analyser, startRecording, stopRecording, cancelRecording } = useAudioRecorder()

  const sttEnabled = useAppStore(s => s.settings?.speechToText?.enabled)
  const transcribeAudio = useAppStore(s => s.transcribeAudio)
  const retrySpeechRecord = useAppStore(s => s.retrySpeechRecord)
  const currentProjectId = useAppStore(s => s.currentProjectId)
  const currentConversationId = useAppStore(s => s.currentConversationId)

  const handleAttachFiles = useCallback(async (files: File[]) => {
    const parts = await filesToFileUIParts(files)
    if (parts.length > 0) {
      setAttachedFiles(prev => [...prev, ...parts])
    }
  }, [])

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if ((!trimmed && attachedFiles.length === 0) || disabled) return
    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined)
    setValue('')
    setAttachedFiles([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, attachedFiles, disabled, onSend])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  // --- File input click ---
  const handleAttachClick = () => fileInputRef.current?.click()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) handleAttachFiles(Array.from(files))
    e.target.value = '' // reset so same file can be re-selected
  }

  // --- Drag and drop ---
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length > 0) handleAttachFiles(files)
  }

  // --- Paste ---
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      handleAttachFiles(imageFiles)
    }
  }

  // --- Mic recording ---
  const handleMicClick = useCallback(async () => {
    try {
      setTranscriptionError(null)
      setRecordingState('recording')
      await startRecording()
    } catch (err) {
      setRecordingState('error')
      setTranscriptionError(err instanceof Error ? err.message : t('input.startRecordingFailed'))
    }
  }, [startRecording, t])

  const handleStopRecording = useCallback(async () => {
    const blob = await stopRecording()
    if (!blob) {
      setRecordingState('idle')
      return
    }

    setRecordingState('transcribing')
    try {
      const record = await transcribeAudio(blob, {
        audioDurationMs: durationMs,
        projectId: currentProjectId ?? undefined as unknown as ProjectId,
        conversationId: currentConversationId ?? undefined as unknown as ConversationId,
      })
      setLastTranscriptionId(record.id)

      if (record.status === 'success' && record.text) {
        // Append transcribed text to textarea
        setValue(prev => {
          const separator = prev.trim() ? ' ' : ''
          return prev + separator + record.text
        })
        setRecordingState('idle')
      } else if (record.status === 'failed') {
        setRecordingState('error')
        setTranscriptionError(record.error ?? t('input.transcriptionFailed'))
      } else {
        setRecordingState('idle')
      }
    } catch (err) {
      setRecordingState('error')
      setTranscriptionError(err instanceof Error ? err.message : t('input.transcriptionFailed'))
    }
  }, [stopRecording, transcribeAudio, durationMs, currentProjectId, currentConversationId, t])

  const handleCancelRecording = useCallback(() => {
    cancelRecording()
    setRecordingState('idle')
    setTranscriptionError(null)
  }, [cancelRecording])

  const handleRetry = useCallback(async () => {
    if (!lastTranscriptionId) return
    setRecordingState('transcribing')
    setTranscriptionError(null)
    try {
      const record = await retrySpeechRecord(lastTranscriptionId)
      if (record.status === 'success' && record.text) {
        setValue(prev => {
          const separator = prev.trim() ? ' ' : ''
          return prev + separator + record.text
        })
        setRecordingState('idle')
      } else {
        setRecordingState('error')
        setTranscriptionError(record.error ?? t('input.retryFailed'))
      }
    } catch (err) {
      setRecordingState('error')
      setTranscriptionError(err instanceof Error ? err.message : t('input.retryFailed'))
    }
  }, [lastTranscriptionId, retrySpeechRecord, t])

  const handleDismissError = useCallback(() => {
    setRecordingState('idle')
    setTranscriptionError(null)
  }, [])

  const canSend = (value.trim() || attachedFiles.length > 0) && !disabled

  return (
    <div className="p-3 border-t-2 border-border-dim bg-deep">
      <div
        className={`border-2 bg-surface transition-colors ${
          isDragOver ? 'border-accent-blue bg-accent-blue/5' : 'border-border-dim'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Image preview strip */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2">
            {attachedFiles.map((file, i) => (
              <div key={i} className="relative group/thumb">
                <img
                  src={file.url}
                  alt={file.filename || t('message.untitledFile')}
                  className="w-14 h-14 object-cover border-2 border-border-dim"
                />
                <button
                  onClick={() => handleRemoveFile(i)}
                  className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-accent-red text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                  title={t('common:button.cancel')}
                >
                  <CloseSmallIcon className="w-[8px] h-[8px]" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Recording waveform overlay — cancel(X) | waveform + timer | confirm(✓) */}
        {recordingState === 'recording' && (
          <div className="flex items-center gap-3 px-2 py-2">
            <button
              onClick={handleCancelRecording}
              className="shrink-0 w-9 h-9 flex items-center justify-center border-2 border-border-dim bg-deep hover:border-accent-red hover:text-accent-red text-text-dim transition-colors cursor-pointer"
              title={t('common:button.cancel')}
            >
              <CloseSmallIcon className="w-[14px] h-[14px]" />
            </button>
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <VoiceWaveform analyser={analyser} isActive={isRecording} />
              <span className="font-mono text-[13px] text-accent-red tabular-nums shrink-0">
                {formatDuration(durationMs)}
              </span>
            </div>
            <button
              onClick={handleStopRecording}
              className="shrink-0 w-9 h-9 flex items-center justify-center border-2 border-accent-green/50 bg-deep hover:border-accent-green text-accent-green transition-colors cursor-pointer"
              title={t('common:button.done')}
            >
              <CheckIcon className="w-[16px] h-[16px]" />
            </button>
          </div>
        )}

        {/* Transcribing state */}
        {recordingState === 'transcribing' && (
          <div className="flex items-center gap-2 px-3 py-2">
            <PixelSpinner size="sm" />
            <span className="font-pixel text-[10px] text-text-secondary">{t('input.transcribing')}</span>
          </div>
        )}

        {/* Error state */}
        {recordingState === 'error' && transcriptionError && (
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="font-mono text-[11px] text-accent-red truncate flex-1">{transcriptionError}</span>
            {lastTranscriptionId && (
              <PixelButton variant="secondary" size="sm" onClick={handleRetry} className="!h-5 !px-2 !text-[9px]">
                {t('common:button.retry')}
              </PixelButton>
            )}
            <PixelButton variant="ghost" size="sm" onClick={handleDismissError} className="!h-5 !px-2 !text-[9px]">
              {t('common:button.dismiss')}
            </PixelButton>
          </div>
        )}

        {/* Textarea — hidden during recording/transcribing */}
        {recordingState === 'idle' && (
          <textarea
            ref={textareaRef}
            data-testid="chat-input"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isDragOver ? t('input.dropPlaceholder') : t('input.placeholder')}
            disabled={disabled}
            rows={1}
            className="w-full min-h-[36px] max-h-[160px] bg-transparent px-3 py-2 font-mono text-[13px] text-text-primary placeholder:text-text-dim outline-none resize-none"
          />
        )}

        {/* Bottom toolbar — hidden during recording (controls are in the waveform bar) */}
        {recordingState !== 'recording' && (
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-1">
              <button
                onClick={handleAttachClick}
                disabled={disabled || recordingState !== 'idle'}
                className="p-0.5 text-text-dim hover:text-accent-blue transition-colors disabled:opacity-50"
                title={t('input.attachImage')}
              >
                <ImageAttachIcon className="w-[14px] h-[12px]" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="flex items-center gap-1">
              {/* Mic button — right side, hidden during recording/streaming */}
              {sttEnabled && recordingState === 'idle' && !isStreaming && (
                <button
                  onClick={handleMicClick}
                  disabled={disabled}
                  className="p-1 text-accent-green hover:text-accent-green/70 transition-colors disabled:opacity-50 cursor-pointer"
                  title={t('input.recordAudio')}
                >
                  <MicIcon className="w-[14px] h-[14px]" />
                </button>
              )}

              {isStreaming ? (
                <PixelButton
                  data-testid="chat-stop-btn"
                  variant="danger"
                  size="sm"
                  onClick={onStop}
                  className="!h-6 !px-2 !text-[10px]"
                >
                  <StopSquareIcon className="w-[8px] h-[8px] mr-1" />
                  {t('common:button.stop')}
                </PixelButton>
              ) : recordingState === 'idle' ? (
                <PixelButton
                  data-testid="chat-send-btn"
                  variant="primary"
                  size="sm"
                  disabled={!canSend}
                  onClick={handleSend}
                  className="!h-6 !px-2 !text-[10px]"
                >
                  {t('common:button.send')}
                </PixelButton>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
