import { useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { modalTransition } from '../../lib/motion'

interface PixelModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const sizeClasses = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[800px]',
  xl: 'max-w-[80vw]',
  '2xl': 'max-w-[90vw]',
}

export function PixelModal({ open, onClose, title, children, footer, size = 'md' }: PixelModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop — no blur for pixel-clean style */}
          <motion.div
            className="absolute inset-0 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className={`relative w-full ${sizeClasses[size]} mx-4 bg-surface border-2 border-border-bright shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_0_rgba(0,0,0,0.3),4px_4px_0_0_rgba(0,0,0,0.5)]`}
            {...modalTransition}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-dim">
              <h2 className="font-pixel text-[12px] text-text-primary">{title}</h2>
              <button
                onClick={onClose}
                className="text-text-secondary hover:text-text-primary font-mono text-[16px] leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="p-4">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t-2 border-border-dim">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
