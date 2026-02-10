import { type InputHTMLAttributes, forwardRef } from 'react'

interface PixelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helper?: string
}

export const PixelInput = forwardRef<HTMLInputElement, PixelInputProps>(
  ({ label, error, helper, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`h-9 bg-deep px-3 py-2 font-mono text-[13px] text-text-primary border-2 placeholder:text-text-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] outline-none transition-colors ${
            error
              ? 'border-accent-red shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3),0_0_0_2px_#F87171]'
              : 'border-border-dim hover:border-border-bright focus:border-accent-blue focus:shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3),0_0_0_2px_#60A5FA]'
          } disabled:opacity-50 disabled:bg-surface ${className}`}
          {...props}
        />
        {error && <span className="text-[11px] text-accent-red">{error}</span>}
        {!error && helper && <span className="text-[11px] text-text-dim">{helper}</span>}
      </div>
    )
  }
)

PixelInput.displayName = 'PixelInput'
