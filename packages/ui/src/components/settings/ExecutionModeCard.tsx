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
    <div role="radiogroup" aria-label="Execution mode" className="flex flex-col gap-2">
      {options.map(option => {
        const isSelected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.id)}
            className={`p-4 border-2 text-left cursor-pointer transition-colors ${
              isSelected
                ? 'border-accent-green bg-elevated border-l-4 border-l-accent-green'
                : 'border-border-dim bg-deep hover:border-border-bright'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Radio indicator */}
              <div
                className={`w-4 h-4 mt-0.5 border-2 shrink-0 flex items-center justify-center ${
                  isSelected ? 'border-accent-green bg-deep' : 'border-border-dim bg-deep'
                }`}
              >
                {isSelected && <div className="w-2 h-2 bg-accent-green" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-pixel text-[10px] text-text-primary">{option.name}</span>
                  {option.badge && (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 font-pixel text-[8px] border-2 ${
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
                  <div className="font-mono text-[11px] text-text-dim italic mt-0.5">
                    {option.subtitle}
                  </div>
                )}
                <div className="font-mono text-[11px] text-text-secondary mt-1">
                  {option.description}
                </div>
                {isSelected && option.children && (
                  <div className="mt-3">{option.children}</div>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
