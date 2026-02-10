interface PixelSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const sizeClasses = {
  sm: 'text-[8px] gap-[3px]',
  md: 'text-[10px] gap-[4px]',
  lg: 'text-[14px] gap-[5px]',
}

export function PixelSpinner({ size = 'md', label }: PixelSpinnerProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Three-dot typing animation using CSS steps */}
      <div className={`flex items-center ${sizeClasses[size]}`}>
        <span className="inline-block w-2 h-2 bg-accent-green animate-[pixel-pulse_0.8s_steps(2)_infinite]" />
        <span className="inline-block w-2 h-2 bg-accent-green animate-[pixel-pulse_0.8s_steps(2)_0.2s_infinite]" />
        <span className="inline-block w-2 h-2 bg-accent-green animate-[pixel-pulse_0.8s_steps(2)_0.4s_infinite]" />
      </div>
      {label && (
        <span className="font-pixel text-[10px] text-text-secondary">{label}</span>
      )}
    </div>
  )
}
