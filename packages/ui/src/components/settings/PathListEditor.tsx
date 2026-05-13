import { useMemo, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PixelButton, PixelInput } from '../base'

interface PathListEditorProps {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  readOnly?: boolean
  helperText?: string
  /** Optional validation function. Returns error string or null if valid. */
  validateItem?: (value: string) => string | null
}

export function PathListEditor({
  label,
  items,
  onChange,
  placeholder = 'Enter value...',
  readOnly = false,
  helperText,
  validateItem,
}: PathListEditorProps) {
  const { t } = useTranslation('common')
  const [inputValue, setInputValue] = useState('')

  // Compute validation results for all items
  const validationErrors = useMemo(() => {
    if (!validateItem) return new Map<number, string>()
    const errors = new Map<number, string>()
    items.forEach((item, i) => {
      const error = validateItem(item)
      if (error) errors.set(i, error)
    })
    return errors
  }, [items, validateItem])

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
        {items.map((item, i) => {
          const error = validationErrors.get(i)
          return (
            <span
              key={`${item}-${i}`}
              className={`inline-flex items-center gap-1.5 bg-deep border-2 px-2 py-1 font-mono text-[11px] ${
                error
                  ? 'border-accent-amber text-accent-amber'
                  : 'border-border-dim text-text-primary'
              } ${readOnly ? 'opacity-60' : ''}`}
            >
              {error && <span className="text-[10px]">{'\u26A0'}</span>}
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
          )
        })}
        {items.length === 0 && (
          <span className="text-[11px] text-text-dim italic py-1">{t('list.noneConfigured')}</span>
        )}
      </div>

      {/* Validation warnings */}
      {validationErrors.size > 0 && (
        <div className="flex flex-col gap-0.5 mt-1.5">
          {Array.from(validationErrors.entries()).map(([i, error]) => (
            <div key={i} className="text-[11px] text-accent-amber">
              {'\u26A0'} {items[i]}: {error}
            </div>
          ))}
        </div>
      )}

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
            {t('button.add')}
          </PixelButton>
        </div>
      )}
    </div>
  )
}
