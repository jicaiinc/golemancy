import { useState, useMemo } from 'react'
import { motion } from 'motion/react'
import type { ArtifactType } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelCard, PixelButton, PixelModal, PixelSpinner } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { ArtifactPreview } from './ArtifactPreview'

const typeIcons: Record<ArtifactType, string> = {
  text: '\u{1F4DD}',
  code: '\u{1F4BB}',
  image: '\u{1F5BC}',
  file: '\u{1F4C1}',
  data: '\u{1F4CA}',
}
const typeColors: Record<ArtifactType, string> = {
  text: 'text-accent-green',
  code: 'text-accent-amber',
  image: 'text-accent-purple',
  file: 'text-accent-blue',
  data: 'text-accent-cyan',
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

export function ArtifactsPage() {
  const project = useCurrentProject()
  const artifacts = useAppStore(s => s.artifacts)
  const artifactsLoading = useAppStore(s => s.artifactsLoading)
  const agents = useAppStore(s => s.agents)
  const deleteArtifact = useAppStore(s => s.deleteArtifact)

  const [previewId, setPreviewId] = useState<string | null>(null)

  const previewItem = useMemo(
    () => artifacts.find(a => a.id === previewId) ?? null,
    [artifacts, previewId],
  )

  if (!project) return null

  return (
    <motion.div className="p-6" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-pixel text-[14px] text-text-primary">Artifacts</h1>
        <p className="text-[12px] text-text-secondary mt-1">
          {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Grid */}
      {artifactsLoading ? (
        <div className="flex justify-center py-12">
          <PixelSpinner label="Loading artifacts..." />
        </div>
      ) : artifacts.length === 0 ? (
        <motion.div {...staggerItem}>
          <PixelCard variant="outlined">
            <div className="text-center py-8">
              <div className="font-pixel text-[20px] text-text-dim mb-4">{'\u{1F4E6}'}</div>
              <p className="font-pixel text-[10px] text-text-secondary">No artifacts yet</p>
              <p className="text-[12px] text-text-dim mt-2">Artifacts appear here when agents produce outputs</p>
            </div>
          </PixelCard>
        </motion.div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          {...staggerContainer}
          initial="initial"
          animate="animate"
        >
          {artifacts.map(artifact => {
            const agent = agents.find(a => a.id === artifact.agentId)
            return (
              <motion.div key={artifact.id} {...staggerItem}>
                <PixelCard variant="interactive" onClick={() => setPreviewId(artifact.id)}>
                  <div className="flex items-start gap-3">
                    <span className="text-[18px]">{typeIcons[artifact.type]}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[12px] text-text-primary truncate">{artifact.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-pixel ${typeColors[artifact.type]}`}>
                          {artifact.type.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-text-dim">{formatSize(artifact.size)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border-dim/50">
                    <span className="text-[10px] text-accent-blue">{agent?.name ?? '???'}</span>
                    <span className="ml-auto text-[10px] text-text-dim">{relativeTime(artifact.createdAt)}</span>
                  </div>
                </PixelCard>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Preview modal */}
      <PixelModal
        open={!!previewItem}
        onClose={() => setPreviewId(null)}
        title={previewItem?.title ?? 'Preview'}
        size="lg"
        footer={
          <>
            <PixelButton
              variant="danger"
              size="sm"
              onClick={() => {
                if (previewItem) {
                  deleteArtifact(previewItem.id)
                  setPreviewId(null)
                }
              }}
            >
              Delete
            </PixelButton>
            <PixelButton variant="primary" onClick={() => setPreviewId(null)}>Close</PixelButton>
          </>
        }
      >
        {previewItem && <ArtifactPreview artifact={previewItem} />}
      </PixelModal>
    </motion.div>
  )
}
