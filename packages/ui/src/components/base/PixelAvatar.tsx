import type { HTMLAttributes } from 'react'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface PixelAvatarProps extends HTMLAttributes<HTMLDivElement> {
  size?: AvatarSize
  src?: string
  initials?: string
  status?: 'online' | 'offline' | 'paused' | 'error'
}

const sizeClasses: Record<AvatarSize, { container: string; text: string; indicator: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[8px]', indicator: 'w-1.5 h-1.5' },
  sm: { container: 'w-8 h-8', text: 'text-[10px]', indicator: 'w-2 h-2' },
  md: { container: 'w-10 h-10', text: 'text-[12px]', indicator: 'w-2 h-2' },
  lg: { container: 'w-14 h-14', text: 'text-[14px]', indicator: 'w-2.5 h-2.5' },
  xl: { container: 'w-[72px] h-[72px]', text: 'text-[16px]', indicator: 'w-3 h-3' },
}

const statusColors: Record<NonNullable<PixelAvatarProps['status']>, string> = {
  online: 'bg-accent-green',
  offline: 'bg-text-secondary',
  paused: 'bg-accent-amber',
  error: 'bg-accent-red',
}

export function PixelAvatar({ size = 'md', src, initials, status, className = '', ...props }: PixelAvatarProps) {
  const s = sizeClasses[size]

  return (
    <div className={`relative inline-flex items-center justify-center bg-elevated border-2 border-border-dim shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3)] ${s.container} ${className}`} {...props}>
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <span className={`font-pixel ${s.text} text-text-primary`}>
          {initials?.slice(0, 2).toUpperCase()}
        </span>
      )}
      {status && (
        <span className={`absolute bottom-0 right-0 ${s.indicator} ${statusColors[status]} border border-void`} />
      )}
    </div>
  )
}
