import type { ReactNode } from 'react'

export interface ExecutionModeOption {
  id: string
  name: string
  subtitle?: string
  description: string
  badge?: {
    label: string
    variant: 'success' | 'error' | 'info'
  }
  children?: ReactNode
}

interface ExecutionModeCardProps {
  options: ExecutionModeOption[]
  value: string
  onChange: (id: string) => void
}

export function ExecutionModeCard({ options, value, onChange }: ExecutionModeCardProps) {
  return (
    <div role="radiogroup" aria-label="Execution mode" className="grid grid-cols-3 gap-2">
      {options.map(option => {
        const isSelected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.id)}
            className={`p-3 border-2 text-left cursor-pointer transition-colors ${
              isSelected
                ? 'border-accent-green bg-elevated border-t-4 border-t-accent-green'
                : 'border-border-dim bg-deep hover:border-border-bright'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {/* Radio indicator */}
              <div
                className={`w-3 h-3 border-2 shrink-0 flex items-center justify-center ${
                  isSelected ? 'border-accent-green bg-deep' : 'border-border-dim bg-deep'
                }`}
              >
                {isSelected && <div className="w-1.5 h-1.5 bg-accent-green" />}
              </div>
              <span className="font-pixel text-[10px] text-text-primary">{option.name}</span>
              {option.badge && (
                <span
                  className={`inline-flex items-center px-1 py-0.5 font-pixel text-[7px] border ${
                    option.badge.variant === 'success'
                      ? 'bg-accent-green/15 text-accent-green border-accent-green/30'
                      : option.badge.variant === 'error'
                        ? 'bg-accent-red/15 text-accent-red border-accent-red/30'
                        : 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                  }`}
                >
                  {option.badge.label}
                </span>
              )}
            </div>
            {option.subtitle && (
              <div className="font-mono text-[10px] text-text-dim italic mb-1">
                {option.subtitle}
              </div>
            )}
            <div className="font-mono text-[10px] text-text-secondary leading-snug">
              {option.description}
            </div>
            {isSelected && option.children && (
              <div className="mt-2">{option.children}</div>
            )}
          </button>
        )
      })}
    </div>
  )
}
