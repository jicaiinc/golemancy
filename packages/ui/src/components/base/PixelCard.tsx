import { type HTMLAttributes, forwardRef } from 'react'

type Variant = 'default' | 'elevated' | 'interactive' | 'outlined'

interface PixelCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  selected?: boolean
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-surface border-2 border-border-dim shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)]',
  elevated: 'bg-elevated border-2 border-border-bright shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5)]',
  interactive: 'bg-surface border-2 border-border-dim shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)] hover:bg-elevated hover:border-border-bright cursor-pointer transition-colors',
  outlined: 'bg-transparent border-2 border-dashed border-border-dim',
}

export const PixelCard = forwardRef<HTMLDivElement, PixelCardProps>(
  ({ variant = 'default', selected, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`p-4 ${variantClasses[variant]} ${selected ? 'border-l-accent-green border-l-2' : ''} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

PixelCard.displayName = 'PixelCard'
