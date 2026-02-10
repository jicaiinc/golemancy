import { useState, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import type { MemoryEntry } from '@solocraft/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import {
  PixelCard, PixelButton, PixelInput, PixelTextArea,
  PixelModal, PixelSpinner, PixelBadge,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function MemoryPage() {
  const project = useCurrentProject()
  const memories = useAppStore(s => s.memories)
  const memoriesLoading = useAppStore(s => s.memoriesLoading)
  const createMemory = useAppStore(s => s.createMemory)
  const updateMemory = useAppStore(s => s.updateMemory)
  const deleteMemory = useAppStore(s => s.deleteMemory)

  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editEntry, setEditEntry] = useState<MemoryEntry | null>(null)

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    memories.forEach(m => m.tags.forEach(t => tagSet.add(t)))
    return [...tagSet].sort()
  }, [memories])

  // Filter by search + tag
  const filtered = useMemo(() => {
    return memories.filter(e => {
      if (filterTag && !e.tags.includes(filterTag)) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        e.content.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      )
    })
  }, [memories, search, filterTag])

  if (!project) return null

  return (
    <motion.div className="p-6" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">Memory Bank</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            {memories.length} memor{memories.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <PixelButton variant="primary" onClick={() => setShowAdd(true)}>+ Add Entry</PixelButton>
      </div>

      {/* Search */}
      <motion.div {...staggerItem} className="mb-4">
        <PixelInput
          placeholder="Search memories by content, source, or tag..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </motion.div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <motion.div {...staggerItem} className="flex flex-wrap gap-2 mb-4">
          <PixelBadge
            variant={filterTag === null ? 'info' : 'idle'}
            className="cursor-pointer"
            onClick={() => setFilterTag(null)}
          >
            all
          </PixelBadge>
          {allTags.map(tag => (
            <PixelBadge
              key={tag}
              variant={filterTag === tag ? 'info' : 'idle'}
              className="cursor-pointer"
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            >
              {tag}
            </PixelBadge>
          ))}
        </motion.div>
      )}

      {/* Memory list */}
      {memoriesLoading ? (
        <div className="flex justify-center py-12">
          <PixelSpinner label="Loading memories..." />
        </div>
      ) : filtered.length === 0 ? (
        <motion.div {...staggerItem}>
          <PixelCard variant="outlined">
            <div className="text-center py-8">
              <div className="font-pixel text-[20px] text-text-dim mb-4">()</div>
              <p className="font-pixel text-[10px] text-text-secondary">
                {search || filterTag ? 'No matching memories' : 'No memories yet'}
              </p>
              {!search && !filterTag && (
                <p className="text-[12px] text-text-dim mt-2">
                  Memories help agents retain context across conversations
                </p>
              )}
            </div>
          </PixelCard>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(entry => (
            <motion.div key={entry.id} {...staggerItem}>
              <PixelCard>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-text-primary whitespace-pre-wrap">{entry.content}</p>
                    <div className="flex items-center flex-wrap gap-2 mt-2">
                      <span className="text-[10px] text-accent-blue font-mono">{entry.source}</span>
                      {entry.tags.map(tag => (
                        <PixelBadge
                          key={tag}
                          variant="idle"
                          className="cursor-pointer"
                          onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                        >
                          {tag}
                        </PixelBadge>
                      ))}
                      <span className="ml-auto text-[10px] text-text-dim shrink-0">{relativeTime(entry.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <PixelButton size="sm" variant="ghost" onClick={() => setEditEntry(entry)}>Edit</PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => deleteMemory(entry.id)}>&times;</PixelButton>
                  </div>
                </div>
              </PixelCard>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add modal */}
      <MemoryFormModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={async (content, source, tags) => {
          await createMemory({ content, source, tags })
          setShowAdd(false)
        }}
        title="Add Memory Entry"
      />

      {/* Edit modal */}
      {editEntry && (
        <MemoryFormModal
          open
          onClose={() => setEditEntry(null)}
          onSubmit={async (content, _source, tags) => {
            await updateMemory(editEntry.id, { content, tags })
            setEditEntry(null)
          }}
          title="Edit Memory Entry"
          initialContent={editEntry.content}
          initialSource={editEntry.source}
          initialTags={editEntry.tags.join(', ')}
          sourceReadonly
        />
      )}
    </motion.div>
  )
}

// --- Memory form modal ---
function MemoryFormModal({ open, onClose, onSubmit, title, initialContent = '', initialSource = '', initialTags = '', sourceReadonly = false }: {
  open: boolean
  onClose: () => void
  onSubmit: (content: string, source: string, tags: string[]) => void
  title: string
  initialContent?: string
  initialSource?: string
  initialTags?: string
  sourceReadonly?: boolean
}) {
  const [content, setContent] = useState(initialContent)
  const [source, setSource] = useState(initialSource)
  const [tags, setTags] = useState(initialTags)

  useEffect(() => {
    setContent(initialContent)
    setSource(initialSource)
    setTags(initialTags)
  }, [initialContent, initialSource, initialTags])

  function handleSubmit() {
    if (!content.trim()) return
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
    onSubmit(content.trim(), source.trim() || 'User', tagList)
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose}>Cancel</PixelButton>
          <PixelButton variant="primary" disabled={!content.trim()} onClick={handleSubmit}>Save</PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelTextArea label="CONTENT" value={content} onChange={e => setContent(e.target.value)} rows={4} autoFocus />
        <PixelInput
          label="SOURCE"
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="e.g. Researcher"
          disabled={sourceReadonly}
        />
        <PixelInput
          label="TAGS (comma-separated)"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="e.g. strategy, audience"
        />
      </div>
    </PixelModal>
  )
}
