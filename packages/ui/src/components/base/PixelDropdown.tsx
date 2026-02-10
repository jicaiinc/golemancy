import { useState, useRef, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { dropdownTransition } from '../../lib/motion'

interface DropdownItem {
  label: string
  value: string
  selected?: boolean
}

interface PixelDropdownProps {
  trigger: ReactNode
  items: DropdownItem[]
  onSelect: (value: string) => void
  dividerAfter?: number[]
}

export function PixelDropdown({ trigger, items, onSelect, dividerAfter = [] }: PixelDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} className="relative inline-block">
      <div onClick={() => setOpen(!open)}>{trigger}</div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-full left-0 mt-1 min-w-[180px] bg-surface border-2 border-border-bright shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5)] z-50"
            {...dropdownTransition}
          >
            {items.map((item, i) => (
              <div key={item.value}>
                <button
                  className="w-full text-left px-3 py-2 font-mono text-[12px] text-text-primary hover:bg-elevated cursor-pointer flex items-center justify-between"
                  onClick={() => {
                    onSelect(item.value)
                    setOpen(false)
                  }}
                >
                  {item.label}
                  {item.selected && <span className="text-accent-green">&check;</span>}
                </button>
                {dividerAfter.includes(i) && (
                  <div className="border-t-2 border-border-dim my-0" />
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
