import { useState, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { MemoryEntry } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import {
  PixelCard, PixelButton, PixelInput, PixelTextArea,
  PixelModal, PixelSpinner, PixelBadge,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { relativeTime } from '../../lib/time'

export function MemoryPage() {
  const { t } = useTranslation(['memory', 'common'])
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
        e.tags.some(tag => tag.toLowerCase().includes(q))
      )
    })
  }, [memories, search, filterTag])

  if (!project) return null

  return (
    <motion.div className="p-6" data-testid="memory-page" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">{t('memory:page.title')}</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            {t('memory:page.entryCount', { count: memories.length })}
          </p>
        </div>
        <PixelButton variant="primary" data-testid="memory-add-btn" onClick={() => setShowAdd(true)}>{t('memory:page.addEntryBtn')}</PixelButton>
      </div>

      {/* Search */}
      <motion.div {...staggerItem} className="mb-4">
        <PixelInput
          data-testid="memory-search"
          placeholder={t('memory:search.placeholder')}
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
            {t('memory:filter.all')}
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
          <PixelSpinner label={t('memory:loading')} />
        </div>
      ) : filtered.length === 0 ? (
        <motion.div {...staggerItem}>
          <PixelCard variant="outlined">
            <div className="text-center py-8">
              <div className="font-pixel text-[20px] text-text-dim mb-4">()</div>
              <p className="font-pixel text-[10px] text-text-secondary">
                {search || filterTag ? t('memory:empty.noMatch') : t('memory:empty.noEntries')}
              </p>
              {!search && !filterTag && (
                <p className="text-[12px] text-text-dim mt-2">
                  {t('memory:empty.hint')}
                </p>
              )}
            </div>
          </PixelCard>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(entry => (
            <motion.div key={entry.id} {...staggerItem}>
              <PixelCard data-testid="memory-card">
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
                      <span className="ml-auto text-[10px] text-text-dim shrink-0">{relativeTime(entry.updatedAt, t)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <PixelButton size="sm" variant="ghost" onClick={() => setEditEntry(entry)}>{t('common:button.edit')}</PixelButton>
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
        title={t('memory:form.addTitle')}
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
          title={t('memory:form.editTitle')}
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
  const { t } = useTranslation(['memory', 'common'])
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
    const tagList = tags.split(',').map(tag => tag.trim()).filter(Boolean)
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
          <PixelButton variant="ghost" onClick={onClose}>{t('common:button.cancel')}</PixelButton>
          <PixelButton variant="primary" disabled={!content.trim()} onClick={handleSubmit}>{t('common:button.save')}</PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelTextArea label={t('memory:form.contentLabel')} value={content} onChange={e => setContent(e.target.value)} rows={4} autoFocus />
        <PixelInput
          label={t('memory:form.sourceLabel')}
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder={t('memory:form.sourcePlaceholder')}
          disabled={sourceReadonly}
        />
        <PixelInput
          label={t('memory:form.tagsLabel')}
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder={t('memory:form.tagsPlaceholder')}
        />
      </div>
    </PixelModal>
  )
}
