import { useState, useCallback, useRef, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface PixelDropZoneProps {
  /** Accepted file extensions (e.g. ['.json', '.md', '.zip']) */
  accept?: string[]
  /** Called with accepted files after drop */
  onDrop: (files: File[]) => void
  /** Content to display inside the drop zone */
  children?: ReactNode
  /** Additional class names */
  className?: string
  /** Whether the drop zone is disabled */
  disabled?: boolean
}

export function PixelDropZone({ accept, onDrop, children, className = '', disabled }: PixelDropZoneProps) {
  const { t } = useTranslation('common')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filterFiles = useCallback((files: File[]): File[] => {
    if (!accept || accept.length === 0) return files
    return files.filter(f => accept.some(ext => f.name.toLowerCase().endsWith(ext)))
  }, [accept])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragOver(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear when leaving the drop zone entirely, not when entering a child element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    const filtered = filterFiles(files)
    if (filtered.length > 0) onDrop(filtered)
  }, [filterFiles, onDrop, disabled])

  const handleClick = useCallback(() => {
    if (!disabled) fileInputRef.current?.click()
  }, [disabled])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    const filtered = filterFiles(files)
    if (filtered.length > 0) onDrop(filtered)

    // Reset input so the same file can be selected again
    e.target.value = ''
  }, [filterFiles, onDrop])

  // Convert accept extensions to input accept attribute (e.g. ['.json'] → '.json')
  const inputAccept = accept?.join(',')

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`border-2 border-dashed transition-colors ${
        isDragOver
          ? 'border-accent-blue bg-accent-blue/10'
          : 'border-border-dim bg-deep/50 hover:border-text-dim'
      } ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'} ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={inputAccept}
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      {children ?? (
        <div className="flex flex-col items-center justify-center py-6 px-4">
          <span className="font-arcade text-[16px] text-text-dim mb-2">{isDragOver ? '[+]' : '[~]'}</span>
          <p className="font-mono text-[11px] text-text-secondary text-center">
            {isDragOver ? t('dropZone.releaseToDrop') : t('dropZone.dragAndDrop')}
          </p>
          {accept && (
            <p className="font-mono text-[10px] text-text-dim mt-1">
              {t('dropZone.accepts', { extensions: accept.join(', ') })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
