import { type TextareaHTMLAttributes, forwardRef } from 'react'

interface PixelTextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const PixelTextArea = forwardRef<HTMLTextAreaElement, PixelTextAreaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`min-h-[80px] bg-deep px-3 py-2 font-mono text-[13px] text-text-primary border-2 placeholder:text-text-dim rounded-md shadow-sunken outline-none resize-y transition-colors ${
            error
              ? 'border-accent-red'
              : 'border-border-dim hover:border-border-bright focus:border-accent-blue focus:shadow-sunken-focus-blue'
          } disabled:opacity-50 disabled:bg-surface ${className}`}
          {...props}
        />
        {error && <span className="text-[11px] text-accent-red">{error}</span>}
      </div>
    )
  }
)

PixelTextArea.displayName = 'PixelTextArea'
