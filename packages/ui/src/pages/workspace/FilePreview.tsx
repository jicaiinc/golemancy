import { useState, useEffect, useCallback } from 'react'
import type { FilePreviewData } from '@golemancy/shared'
import { PixelButton, PixelCard, PixelSpinner } from '../../components'
import { useAppStore } from '../../stores'
import { getServices } from '../../services/container'

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function FilePreview({ preview, loading, onDelete }: FilePreviewProps) {
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
        <PixelSpinner label="Loading file..." />
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="font-pixel text-[14px] text-text-dim mb-2">FILE</div>
          <p className="font-pixel text-[10px] text-text-secondary">Select a file to preview</p>
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
        <span className="text-[10px] text-text-dim shrink-0">{relativeTime(preview.modifiedAt)}</span>
        <PixelButton variant="ghost" size="sm" onClick={handleDownload}>
          DL
        </PixelButton>
        {preview.absolutePath && window.electronAPI?.openPath && (
          <PixelButton
            variant="ghost"
            size="sm"
            onClick={() => window.electronAPI?.openPath(preview.absolutePath!)}
          >
            Open
          </PixelButton>
        )}
        <PixelButton
          variant="danger"
          size="sm"
          onClick={() => onDelete(preview.path)}
        >
          Delete
        </PixelButton>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-4">
        {preview.category === 'code' || preview.category === 'text' ? (
          preview.csvRows ? (
            <CsvPreview rows={preview.csvRows} />
          ) : (
            <TextPreview content={preview.content ?? ''} category={preview.category} />
          )
        ) : preview.category === 'image' ? (
          <ImagePreview preview={preview} />
        ) : (
          <MetaPreview preview={preview} />
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

function CsvPreview({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return <p className="text-[12px] text-text-dim">Empty CSV</p>

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

function ImagePreview({ preview }: { preview: FilePreviewData }) {
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
        <p className="text-[12px] text-accent-red">Failed to load image: {error}</p>
      </PixelCard>
    )
  }

  if (!blobUrl) {
    return (
      <div className="flex justify-center py-8">
        <PixelSpinner label="Loading image..." />
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

function MetaPreview({ preview }: { preview: FilePreviewData }) {
  return (
    <PixelCard variant="elevated">
      <div className="text-center py-4">
        <div className="font-pixel text-[14px] text-text-dim mb-4">FILE</div>
        <h3 className="text-[14px] text-text-primary mb-4 font-mono">{preview.path.split('/').pop()}</h3>
        <div className="grid grid-cols-2 gap-2 max-w-[300px] mx-auto text-left">
          <span className="text-[10px] text-text-dim font-pixel">TYPE</span>
          <span className="text-[11px] text-text-primary">{preview.category}</span>
          <span className="text-[10px] text-text-dim font-pixel">MIME</span>
          <span className="text-[11px] text-text-primary">{preview.mimeType}</span>
          <span className="text-[10px] text-text-dim font-pixel">SIZE</span>
          <span className="text-[11px] text-text-primary">{formatSize(preview.size)}</span>
          <span className="text-[10px] text-text-dim font-pixel">MODIFIED</span>
          <span className="text-[11px] text-text-primary">{relativeTime(preview.modifiedAt)}</span>
        </div>
        <p className="text-[10px] text-text-dim mt-4">
          No inline preview available for this file type
        </p>
      </div>
    </PixelCard>
  )
}
