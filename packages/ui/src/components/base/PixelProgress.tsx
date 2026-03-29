interface PixelProgressProps {
  value: number // 0-100
  className?: string
}

export function PixelProgress({ value, className = '' }: PixelProgressProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div className={`h-3 bg-deep border-2 border-border-dim rounded-full overflow-hidden shadow-sunken ${className}`}>
      <div
        className="h-full bg-accent-green transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
