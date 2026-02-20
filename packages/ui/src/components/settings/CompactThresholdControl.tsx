import { useState, useEffect, type ReactNode } from 'react'
import { DEFAULT_COMPACT_THRESHOLD } from '@golemancy/shared'

const SLIDER_MAX = 2_000_000
const SLIDER_STEP = 10_000

/** Parse human-friendly token input: "95000", "95K", "5M", "1,500,000" */
function parseTokenInput(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, '')
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([kKmM])?$/)
  if (!match) return null
  const num = parseFloat(match[1])
  const suffix = match[2]?.toLowerCase()
  if (suffix === 'k') return Math.round(num * 1_000)
  if (suffix === 'm') return Math.round(num * 1_000_000)
  return Math.round(num)
}

interface CompactThresholdControlProps {
  value: number
  onChange: (value: number) => void
  children?: ReactNode
}

export function CompactThresholdControl({ value, onChange, children }: CompactThresholdControlProps) {
  const [inputText, setInputText] = useState(value.toLocaleString())
  const [editing, setEditing] = useState(false)

  // Sync display when value changes externally (e.g. slider drag)
  useEffect(() => {
    if (!editing) setInputText(value.toLocaleString())
  }, [value, editing])

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(Number(e.target.value))
  }

  function handleInputFocus() {
    setEditing(true)
    setInputText(String(value))
  }

  function applyInput() {
    setEditing(false)
    const parsed = parseTokenInput(inputText)
    if (parsed !== null && parsed > 0) {
      onChange(parsed)
    }
    // display will be re-synced by the useEffect
  }

  const clampedValue = Math.max(0, Math.min(value, SLIDER_MAX))
  const fillPercent = (clampedValue / SLIDER_MAX) * 100
  const defaultPercent = (DEFAULT_COMPACT_THRESHOLD / SLIDER_MAX) * 100

  return (
    <div className="flex items-start gap-3">
      {/* Slider + marks */}
      <div className="flex-1 min-w-0 pt-0.5">
        <input
          type="range"
          min={0}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={clampedValue}
          onChange={handleSliderChange}
          className="pixel-slider w-full"
          style={{ '--fill-percent': `${fillPercent}%` } as React.CSSProperties}
        />
        <div className="relative h-3.5 mt-0.5">
          <span className="absolute left-0 text-[8px] font-pixel text-text-dim">0</span>
          <span
            className="absolute text-[8px] font-pixel text-accent-green -translate-x-1/2"
            style={{ left: `${defaultPercent}%` }}
          >
            800K
          </span>
          <span className="absolute right-0 text-[8px] font-pixel text-text-dim">2M</span>
        </div>
      </div>
      {/* Editable value + unit + extra actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={applyInput}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-24 h-7 bg-deep px-2 font-mono text-[12px] text-text-primary text-right border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none focus:border-accent-blue tabular-nums"
        />
        <span className="text-[11px] text-text-dim shrink-0">tokens</span>
        {children}
      </div>
    </div>
  )
}
