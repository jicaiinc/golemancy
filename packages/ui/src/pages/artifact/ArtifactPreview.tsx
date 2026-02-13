import type { Artifact, ArtifactType } from '@golemancy/shared'

interface ArtifactPreviewProps {
  artifact: Artifact
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const typeColors: Record<ArtifactType, string> = {
  text: 'text-accent-green',
  code: 'text-accent-amber',
  image: 'text-accent-purple',
  file: 'text-accent-blue',
  data: 'text-accent-cyan',
}

const typeIcons: Record<ArtifactType, string> = {
  text: '\u{1F4DD}',
  code: '\u{1F4BB}',
  image: '\u{1F5BC}',
  file: '\u{1F4C1}',
  data: '\u{1F4CA}',
}

export function ArtifactPreview({ artifact }: ArtifactPreviewProps) {
  return (
    <div>
      {/* Meta header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[14px]">{typeIcons[artifact.type]}</span>
        <span className={`font-pixel text-[9px] ${typeColors[artifact.type]}`}>
          {artifact.type.toUpperCase()}
        </span>
        <span className="text-[11px] text-text-dim">{formatSize(artifact.size)}</span>
        {artifact.mimeType && (
          <span className="text-[11px] text-text-dim font-mono">{artifact.mimeType}</span>
        )}
      </div>

      {/* Content area */}
      <div className="bg-deep border-2 border-border-dim p-4 max-h-[400px] overflow-auto">
        {artifact.type === 'code' ? (
          <pre className="text-[12px] font-mono text-accent-green whitespace-pre-wrap">{artifact.content}</pre>
        ) : artifact.type === 'text' ? (
          <div className="text-[13px] text-text-primary whitespace-pre-wrap">{artifact.content}</div>
        ) : artifact.type === 'image' ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-32 h-32 bg-surface border-2 border-border-dim flex items-center justify-center mb-3">
              <span className="text-[32px]">{'\u{1F5BC}'}</span>
            </div>
            <p className="text-[12px] text-text-dim">Image preview not available</p>
            <p className="text-[11px] text-text-dim mt-1">{artifact.title}</p>
          </div>
        ) : artifact.type === 'data' ? (
          <div>
            <div className="text-[11px] text-text-dim mb-2 font-pixel">METADATA</div>
            {artifact.filePath && (
              <div className="text-[12px] text-text-secondary font-mono mb-1">Path: {artifact.filePath}</div>
            )}
            <div className="text-[12px] text-text-secondary font-mono mb-1">Size: {formatSize(artifact.size)}</div>
            {artifact.mimeType && (
              <div className="text-[12px] text-text-secondary font-mono mb-3">Type: {artifact.mimeType}</div>
            )}
            {artifact.content && (
              <>
                <div className="text-[11px] text-text-dim mb-1 font-pixel mt-3">PREVIEW</div>
                <pre className="text-[12px] font-mono text-text-secondary whitespace-pre-wrap">{artifact.content}</pre>
              </>
            )}
          </div>
        ) : (
          /* file type */
          <div>
            <div className="text-[11px] text-text-dim mb-2 font-pixel">FILE INFO</div>
            {artifact.filePath && (
              <div className="text-[12px] text-text-secondary font-mono mb-1">Path: {artifact.filePath}</div>
            )}
            <div className="text-[12px] text-text-secondary font-mono mb-1">Size: {formatSize(artifact.size)}</div>
            {artifact.mimeType && (
              <div className="text-[12px] text-text-secondary font-mono">Type: {artifact.mimeType}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
