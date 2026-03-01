import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { FilePreviewData } from '@golemancy/shared'
import { PixelButton, PixelCard, PixelSpinner } from '../../components'
import { useAppStore } from '../../stores'
import { getServices } from '../../services/container'
import { relativeTime } from '../../lib/time'

interface FilePreviewProps {
  preview: FilePreviewData | null
  loading: boolean
  onDelete: (filePath: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilePreview({ preview, loading, onDelete }: FilePreviewProps) {
  const { t } = useTranslation(['workspace', 'common'])
  const projectId = useAppStore(s => s.currentProjectId)

  const handleDownload = useCallback(async () => {
    if (!preview || !projectId) return
    const url = getServices().workspace.getFileUrl(projectId, preview.path)
    const token = window.electronAPI?.getServerToken()
    if (token) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = preview.path.split('/').pop() || 'download'
      a.click()
      URL.revokeObjectURL(a.href)
    } else {
      window.open(url, '_blank')
    }
  }, [preview, projectId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <PixelSpinner label={t('workspace:preview.loading')} />
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="font-pixel text-[14px] text-text-dim mb-2">FILE</div>
          <p className="font-pixel text-[10px] text-text-secondary">{t('workspace:preview.selectFile')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="workspace-preview">
      {/* Action bar */}
      <div className="px-4 py-2 border-b-2 border-border-dim flex items-center gap-2">
        <span className="text-[12px] text-text-primary truncate flex-1 font-mono">{preview.path}</span>
        <span className="text-[10px] text-text-dim shrink-0">{formatSize(preview.size)}</span>
        <span className="text-[10px] text-text-dim shrink-0">{relativeTime(preview.modifiedAt, t)}</span>
        <PixelButton variant="ghost" size="sm" onClick={handleDownload}>
          {t('workspace:preview.download')}
        </PixelButton>
        {preview.absolutePath && window.electronAPI?.openPath && (
          <PixelButton
            variant="ghost"
            size="sm"
            onClick={() => window.electronAPI?.openPath(preview.absolutePath!)}
          >
            {t('workspace:preview.open')}
          </PixelButton>
        )}
        <PixelButton
          variant="danger"
          size="sm"
          onClick={() => onDelete(preview.path)}
        >
          {t('common:button.delete')}
        </PixelButton>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-4">
        {preview.category === 'code' || preview.category === 'text' ? (
          preview.csvRows ? (
            <CsvPreview rows={preview.csvRows} t={t} />
          ) : (
            <TextPreview content={preview.content ?? ''} category={preview.category} />
          )
        ) : preview.category === 'image' ? (
          <ImagePreview preview={preview} t={t} />
        ) : (
          <MetaPreview preview={preview} t={t} />
        )}
      </div>
    </div>
  )
}

function TextPreview({ content, category }: { content: string; category: string }) {
  const textColor = category === 'code' ? 'text-accent-green' : 'text-text-primary'
  return (
    <pre className={`font-mono text-[12px] ${textColor} whitespace-pre-wrap break-all`}>
      {content}
    </pre>
  )
}

function CsvPreview({ rows, t }: { rows: string[][]; t: ReturnType<typeof useTranslation>['t'] }) {
  if (rows.length === 0) return <p className="text-[12px] text-text-dim">{t('workspace:preview.emptyCsv')}</p>

  const [header, ...body] = rows

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="text-left text-[11px] font-pixel text-accent-amber px-2 py-1 border-2 border-border-dim bg-elevated"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="text-[11px] text-text-primary px-2 py-1 border-2 border-border-dim"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImagePreview({ preview, t }: { preview: FilePreviewData; t: ReturnType<typeof useTranslation>['t'] }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const projectId = useAppStore(s => s.currentProjectId)

  useEffect(() => {
    if (!preview.imageUrl || !projectId) return

    let revoke: string | null = null

    const token = window.electronAPI?.getServerToken()
    const baseUrl = window.electronAPI?.getServerBaseUrl()

    if (baseUrl && token) {
      fetch(`${baseUrl}${preview.imageUrl}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load image')
          return res.blob()
        })
        .then(blob => {
          const url = URL.createObjectURL(blob)
          revoke = url
          setBlobUrl(url)
        })
        .catch(e => setError(e.message))
    } else {
      // Dev mode without Electron — try direct URL
      setBlobUrl(preview.imageUrl)
    }

    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [preview.imageUrl, projectId])

  if (error) {
    return (
      <PixelCard variant="outlined">
        <p className="text-[12px] text-accent-red">{t('workspace:preview.imageError', { error })}</p>
      </PixelCard>
    )
  }

  if (!blobUrl) {
    return (
      <div className="flex justify-center py-8">
        <PixelSpinner label={t('workspace:preview.loadingImage')} />
      </div>
    )
  }

  return (
    <div className="flex justify-center">
      <img
        src={blobUrl}
        alt={preview.path}
        className="max-w-full max-h-[70vh] object-contain border-2 border-border-dim"
      />
    </div>
  )
}

function MetaPreview({ preview, t }: { preview: FilePreviewData; t: ReturnType<typeof useTranslation>['t'] }) {
  return (
    <PixelCard variant="elevated">
      <div className="text-center py-4">
        <div className="font-pixel text-[14px] text-text-dim mb-4">FILE</div>
        <h3 className="text-[14px] text-text-primary mb-4 font-mono">{preview.path.split('/').pop()}</h3>
        <div className="grid grid-cols-2 gap-2 max-w-[300px] mx-auto text-left">
          <span className="text-[10px] text-text-dim font-pixel">{t('workspace:preview.meta.type')}</span>
          <span className="text-[11px] text-text-primary">{preview.category}</span>
          <span className="text-[10px] text-text-dim font-pixel">{t('workspace:preview.meta.mime')}</span>
          <span className="text-[11px] text-text-primary">{preview.mimeType}</span>
          <span className="text-[10px] text-text-dim font-pixel">{t('workspace:preview.meta.size')}</span>
          <span className="text-[11px] text-text-primary">{formatSize(preview.size)}</span>
          <span className="text-[10px] text-text-dim font-pixel">{t('workspace:preview.meta.modified')}</span>
          <span className="text-[11px] text-text-primary">{relativeTime(preview.modifiedAt, t)}</span>
        </div>
        <p className="text-[10px] text-text-dim mt-4">
          {t('workspace:preview.noPreview')}
        </p>
      </div>
    </PixelCard>
  )
}
