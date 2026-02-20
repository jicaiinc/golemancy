import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelButton, PixelModal } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { FileTree } from './FileTree'
import { FilePreview } from './FilePreview'

export function WorkspacePage() {
  const project = useCurrentProject()
  const projectId = useAppStore(s => s.currentProjectId)
  const entries = useAppStore(s => s.workspaceEntries)
  const currentPath = useAppStore(s => s.workspaceCurrentPath)
  const preview = useAppStore(s => s.workspacePreview)
  const loading = useAppStore(s => s.workspaceLoading)
  const previewLoading = useAppStore(s => s.workspacePreviewLoading)
  const loadWorkspaceDir = useAppStore(s => s.loadWorkspaceDir)
  const navigateWorkspace = useAppStore(s => s.navigateWorkspace)
  const loadWorkspaceFile = useAppStore(s => s.loadWorkspaceFile)
  const deleteWorkspaceFile = useAppStore(s => s.deleteWorkspaceFile)

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Load workspace root on mount
  useEffect(() => {
    if (projectId) {
      loadWorkspaceDir(projectId, '')
    }
  }, [projectId, loadWorkspaceDir])

  const handleRefresh = useCallback(() => {
    if (projectId) {
      loadWorkspaceDir(projectId, currentPath)
    }
  }, [projectId, currentPath, loadWorkspaceDir])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteWorkspaceFile(deleteTarget)
    setDeleteTarget(null)
  }, [deleteTarget, deleteWorkspaceFile])

  if (!project) return null

  return (
    <motion.div className="h-full flex flex-col" data-testid="workspace-page" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <motion.div {...staggerItem} className="px-6 py-4 border-b-2 border-border-dim flex items-center gap-3">
        <h1 className="font-pixel text-[14px] text-text-primary">Artifacts</h1>
        <PixelButton variant="ghost" size="sm" data-testid="workspace-refresh-btn" onClick={handleRefresh}>
          Refresh
        </PixelButton>
      </motion.div>

      {/* Split layout */}
      <motion.div {...staggerItem} className="flex-1 flex overflow-hidden">
        <FileTree
          entries={entries}
          currentPath={currentPath}
          loading={loading}
          selectedFile={preview?.path ?? null}
          onNavigate={navigateWorkspace}
          onSelectFile={loadWorkspaceFile}
        />
        <FilePreview
          preview={preview}
          loading={previewLoading}
          onDelete={(path) => setDeleteTarget(path)}
        />
      </motion.div>

      {/* Delete confirmation modal */}
      <PixelModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete File"
        size="sm"
        footer={
          <>
            <PixelButton variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </PixelButton>
            <PixelButton variant="danger" size="sm" onClick={handleDelete}>
              Delete
            </PixelButton>
          </>
        }
      >
        <p className="text-[12px] text-text-primary">
          Are you sure you want to delete <span className="font-mono text-accent-amber">{deleteTarget}</span>?
        </p>
        <p className="text-[11px] text-text-dim mt-2">This action cannot be undone.</p>
      </PixelModal>
    </motion.div>
  )
}
