import { useState, type ReactNode } from 'react'

interface PixelTooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom'
}

export function PixelTooltip({ content, children, position = 'top' }: PixelTooltipProps) {
  const [show, setShow] = useState(false)

  const posClasses = position === 'top'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-1'
    : 'top-full left-1/2 -translate-x-1/2 mt-1'

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className={`absolute ${posClasses} px-2 py-1 bg-surface border-2 border-border-bright shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] font-mono text-[11px] text-text-primary whitespace-nowrap z-50 pointer-events-none`}>
          {content}
        </div>
      )}
    </div>
  )
}
