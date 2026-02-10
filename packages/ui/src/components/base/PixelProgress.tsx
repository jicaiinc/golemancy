interface PixelProgressProps {
  value: number // 0-100
  className?: string
}

export function PixelProgress({ value, className = '' }: PixelProgressProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div className={`h-3 bg-deep border-2 border-border-dim shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)] ${className}`}>
      <div
        className="h-full bg-accent-green transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
