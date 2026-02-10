import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link'
type Size = 'sm' | 'md' | 'lg'

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent-green text-void border-2 border-accent-green shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.2),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)] hover:brightness-110 active:shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.2),inset_2px_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px]',
  secondary: 'bg-elevated text-text-primary border-2 border-border-dim shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)] hover:brightness-110 active:shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px]',
  danger: 'bg-accent-red text-void border-2 border-accent-red shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.2),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)] hover:brightness-110 active:shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.2),inset_2px_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px]',
  ghost: 'bg-transparent text-text-secondary border-2 border-border-dim hover:bg-elevated hover:text-text-primary',
  link: 'bg-transparent text-accent-blue border-0 hover:underline p-0',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-3 text-[11px]',
  md: 'h-9 px-4 text-[12px]',
  lg: 'h-11 px-5 text-[13px]',
}

export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center font-mono cursor-pointer transition-transform ${variantClasses[variant]} ${sizeClasses[size]} ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''} ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  }
)

PixelButton.displayName = 'PixelButton'
