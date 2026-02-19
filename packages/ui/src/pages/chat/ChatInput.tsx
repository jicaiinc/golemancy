import { useState, useRef, useCallback, type KeyboardEvent, type DragEvent, type ClipboardEvent } from 'react'
import type { FileUIPart } from 'ai'
import { PixelButton, ImageAttachIcon, CloseSmallIcon } from '../../components'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

interface ChatInputProps {
  onSend: (content: string, files?: FileUIPart[]) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
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
  const [value, setValue] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<FileUIPart[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
                  alt={file.filename || 'Attached image'}
                  className="w-14 h-14 object-cover border-2 border-border-dim"
                />
                <button
                  onClick={() => handleRemoveFile(i)}
                  className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-accent-red text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                  title="Remove"
                >
                  <CloseSmallIcon className="w-[8px] h-[8px]" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          data-testid="chat-input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isDragOver ? 'Drop images here...' : 'Type a message...'}
          disabled={disabled}
          rows={1}
          className="w-full min-h-[36px] max-h-[160px] bg-transparent px-3 py-2 font-mono text-[13px] text-text-primary placeholder:text-text-dim outline-none resize-none"
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 py-1">
          <button
            onClick={handleAttachClick}
            disabled={disabled}
            className="p-0.5 text-text-dim hover:text-accent-blue transition-colors disabled:opacity-50"
            title="Attach image"
          >
            <ImageAttachIcon className="w-[14px] h-[12px]" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {isStreaming ? (
            <PixelButton
              data-testid="chat-stop-btn"
              variant="danger"
              size="sm"
              onClick={onStop}
              className="!h-6 !px-2 !text-[10px]"
            >
              Stop
            </PixelButton>
          ) : (
            <PixelButton
              data-testid="chat-send-btn"
              variant="primary"
              size="sm"
              disabled={!canSend}
              onClick={handleSend}
              className="!h-6 !px-2 !text-[10px]"
            >
              Send
            </PixelButton>
          )}
        </div>
      </div>
    </div>
  )
}
