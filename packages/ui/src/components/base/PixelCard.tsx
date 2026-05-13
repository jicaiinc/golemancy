import { type HTMLAttributes, forwardRef } from 'react'

type Variant = 'default' | 'elevated' | 'interactive' | 'outlined'

interface PixelCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  selected?: boolean
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-surface border-2 border-border-dim shadow-raised',
  elevated: 'bg-elevated border-2 border-border-bright shadow-elevated',
  interactive: 'bg-surface border-2 border-border-dim shadow-raised hover:bg-elevated hover:border-border-bright cursor-pointer transition-colors',
  outlined: 'bg-transparent border-2 border-dashed border-border-dim',
}

export const PixelCard = forwardRef<HTMLDivElement, PixelCardProps>(
  ({ variant = 'default', selected, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`p-4 rounded-lg ${variantClasses[variant]} ${selected ? 'border-l-accent-green border-l-2' : ''} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

PixelCard.displayName = 'PixelCard'
