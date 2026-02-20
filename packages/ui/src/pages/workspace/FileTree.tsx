import type { WorkspaceEntry, FileCategory } from '@golemancy/shared'
import { PixelSpinner } from '../../components'

const categoryColors: Record<FileCategory, string> = {
  code: 'text-accent-amber',
  text: 'text-accent-green',
  image: 'text-accent-purple',
  document: 'text-accent-blue',
  archive: 'text-accent-red',
  audio: 'text-accent-purple',
  video: 'text-accent-blue',
  binary: 'text-text-dim',
}

function getExtBadge(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot === -1 || dot === name.length - 1) return 'FILE'
  const ext = name.slice(dot + 1).toUpperCase()
  return ext.length <= 4 ? ext : ext.slice(0, 3)
}

interface FileTreeProps {
  entries: WorkspaceEntry[]
  currentPath: string
  loading: boolean
  selectedFile: string | null
  onNavigate: (dirPath: string) => void
  onSelectFile: (filePath: string) => void
}

export function FileTree({ entries, currentPath, loading, selectedFile, onNavigate, onSelectFile }: FileTreeProps) {
  const pathSegments = currentPath ? currentPath.split('/') : []

  return (
    <div className="w-[280px] min-w-[280px] border-r-2 border-border-dim flex flex-col overflow-hidden" data-testid="workspace-file-tree">
      {/* Breadcrumb */}
      <div className="px-3 py-2 border-b-2 border-border-dim flex items-center gap-1 flex-wrap min-h-[36px]">
        <button
          onClick={() => onNavigate('')}
          className="font-pixel text-[10px] text-accent-blue hover:text-accent-green cursor-pointer"
        >
          artifacts
        </button>
        {pathSegments.map((seg, i) => {
          const path = pathSegments.slice(0, i + 1).join('/')
          return (
            <span key={path} className="flex items-center gap-1">
              <span className="text-[10px] text-text-dim">/</span>
              <button
                onClick={() => onNavigate(path)}
                className="font-pixel text-[10px] text-accent-blue hover:text-accent-green cursor-pointer"
              >
                {seg}
              </button>
            </span>
          )
        })}
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <PixelSpinner size="sm" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-pixel text-[10px] text-text-dim">Empty directory</p>
          </div>
        ) : (
          <div className="py-1">
            {/* Parent directory entry */}
            {currentPath && (
              <button
                onClick={() => {
                  const parent = currentPath.split('/').slice(0, -1).join('/')
                  onNavigate(parent)
                }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-elevated cursor-pointer transition-colors"
              >
                <span className="font-pixel text-[7px] w-7 text-center text-text-dim">..</span>
                <span className="text-[12px] text-text-secondary">..</span>
              </button>
            )}

            {entries.map(entry => {
              const isDir = entry.type === 'directory'
              const isSelected = !isDir && entry.name === selectedFile
              return (
                <button
                  key={entry.name}
                  onClick={() => isDir ? onNavigate(entry.name) : onSelectFile(entry.name)}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-elevated cursor-pointer transition-colors ${isSelected ? 'bg-elevated border-l-2 border-l-accent-green' : ''}`}
                >
                  <span className={`font-pixel text-[7px] w-7 text-center shrink-0 ${isDir ? 'text-accent-blue' : categoryColors[entry.category ?? 'binary']}`}>
                    {isDir ? 'DIR' : getExtBadge(entry.name)}
                  </span>
                  <span className={`text-[12px] truncate ${isDir ? 'text-accent-blue' : 'text-text-primary'}`}>
                    {entry.name.split('/').pop()}
                  </span>
                  {!isDir && (
                    <span className="ml-auto text-[10px] text-text-dim shrink-0">
                      {formatSize(entry.size)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
