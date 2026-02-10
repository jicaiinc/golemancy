import type { HTMLAttributes } from 'react'

type BadgeVariant = 'idle' | 'running' | 'error' | 'paused' | 'success' | 'info'

interface PixelBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  idle: 'bg-elevated text-text-secondary border-text-secondary/30',
  running: 'bg-accent-green/15 text-accent-green border-accent-green/30',
  error: 'bg-accent-red/15 text-accent-red border-accent-red/30',
  paused: 'bg-accent-amber/15 text-accent-amber border-accent-amber/30',
  success: 'bg-accent-green/15 text-accent-green border-accent-green/30',
  info: 'bg-accent-blue/15 text-accent-blue border-accent-blue/30',
}

const dotClasses: Record<BadgeVariant, string> = {
  idle: 'bg-text-secondary',
  running: 'bg-accent-green animate-[pixel-pulse_1s_steps(2)_infinite]',
  error: 'bg-accent-red',
  paused: 'bg-accent-amber animate-[pixel-pulse_2s_steps(2)_infinite]',
  success: 'bg-accent-green',
  info: 'bg-accent-blue',
}

export function PixelBadge({ variant = 'idle', className = '', children, ...props }: PixelBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 font-pixel text-[8px] leading-[12px] border-2 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      <span className={`inline-block w-1.5 h-1.5 ${dotClasses[variant]}`} />
      {children}
    </span>
  )
}
