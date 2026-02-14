import { useState, type KeyboardEvent } from 'react'
import { PixelButton, PixelInput } from '../base'

interface PathListEditorProps {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  readOnly?: boolean
  helperText?: string
}

export function PathListEditor({
  label,
  items,
  onChange,
  placeholder = 'Enter value...',
  readOnly = false,
  helperText,
}: PathListEditorProps) {
  const [inputValue, setInputValue] = useState('')

  function handleAdd() {
    const trimmed = inputValue.trim()
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed])
      setInputValue('')
    }
  }

  function handleRemove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div>
      <div className="font-pixel text-[8px] text-text-secondary mb-1">{label}</div>
      {helperText && (
        <div className="text-[11px] text-text-dim mb-2">{helperText}</div>
      )}

      {/* Chip list */}
      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className={`inline-flex items-center gap-1.5 bg-deep border-2 border-border-dim px-2 py-1 font-mono text-[11px] text-text-primary ${
              readOnly ? 'opacity-60' : ''
            }`}
          >
            {item}
            {!readOnly && (
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="text-text-dim hover:text-accent-red cursor-pointer text-[14px] leading-none"
                aria-label={`Remove ${item}`}
              >
                &times;
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-[11px] text-text-dim italic py-1">None configured</span>
        )}
      </div>

      {/* Add input */}
      {!readOnly && (
        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <PixelInput
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
            />
          </div>
          <PixelButton
            variant="ghost"
            size="sm"
            onClick={handleAdd}
            disabled={!inputValue.trim()}
          >
            Add
          </PixelButton>
        </div>
      )}
    </div>
  )
}
