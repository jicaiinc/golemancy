import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { PixelButton } from '../../components'

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div className="flex items-end gap-2 p-3 border-t-2 border-border-dim bg-deep">
      <textarea
        ref={textareaRef}
        data-testid="chat-input"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        rows={1}
        className="flex-1 min-h-[36px] max-h-[160px] bg-surface px-3 py-2 font-mono text-[13px] text-text-primary border-2 border-border-dim placeholder:text-text-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none resize-none transition-colors focus:border-accent-blue disabled:opacity-50"
      />
      <PixelButton
        data-testid="chat-send-btn"
        variant="primary"
        disabled={!value.trim() || disabled}
        onClick={handleSend}
      >
        Send
      </PixelButton>
    </div>
  )
}
