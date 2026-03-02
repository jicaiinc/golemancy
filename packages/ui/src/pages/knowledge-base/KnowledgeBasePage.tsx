import { useState, useCallback, useMemo } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { KBCollection, KBCollectionTier } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import {
  PixelCard, PixelButton, PixelBadge, PixelSpinner, PixelProgress,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { relativeTime } from '../../lib/time'
import { NewCollectionModal } from './NewCollectionModal'
import { CollectionDetailModal } from './CollectionDetailModal'

const TIERS: KBCollectionTier[] = ['hot', 'warm', 'cold', 'archive']

const HOT_CHAR_LIMIT = 20_000

const tierColors: Record<KBCollectionTier, { header: string; bg: string; badge: 'error' | 'paused' | 'info' | 'idle' }> = {
  hot: { header: 'bg-accent-red/15 border-accent-red/30', bg: 'bg-accent-red/5', badge: 'error' },
  warm: { header: 'bg-accent-amber/15 border-accent-amber/30', bg: 'bg-accent-amber/5', badge: 'paused' },
  cold: { header: 'bg-accent-blue/15 border-accent-blue/30', bg: 'bg-accent-blue/5', badge: 'info' },
  archive: { header: 'bg-elevated border-border-dim', bg: 'bg-deep', badge: 'idle' },
}

export function KnowledgeBasePage() {
  const { t } = useTranslation(['knowledgeBase', 'common'])
  const project = useCurrentProject()
  const collections = useAppStore(s => s.kbCollections)
  const loading = useAppStore(s => s.kbCollectionsLoading)

  const [newModalTier, setNewModalTier] = useState<KBCollectionTier | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<KBCollection | null>(null)

  const handleCloseDetail = useCallback(() => setSelectedCollection(null), [])
  const handleCloseNew = useCallback(() => setNewModalTier(null), [])

  const byTier = useMemo(() => {
    const map: Record<KBCollectionTier, KBCollection[]> = { hot: [], warm: [], cold: [], archive: [] }
    for (const c of collections) map[c.tier]?.push(c)
    return map
  }, [collections])

  const hotTotalChars = useMemo(
    () => byTier.hot.reduce((sum, c) => sum + c.totalChars, 0),
    [byTier],
  )

  if (!project) return null

  return (
    <motion.div className="flex flex-col h-full" data-testid="knowledge-base-page" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">{t('knowledgeBase:page.title')}</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            {t('knowledgeBase:page.collectionCount', { count: collections.length })}
          </p>
        </div>
        <PixelButton variant="primary" data-testid="kb-add-btn" onClick={() => setNewModalTier('warm')}>
          {t('knowledgeBase:page.newCollectionBtn')}
        </PixelButton>
      </div>

      {/* Kanban columns */}
      {loading ? (
        <div className="flex justify-center py-12">
          <PixelSpinner label={t('knowledgeBase:loading')} />
        </div>
      ) : (
        <motion.div {...staggerItem} className="flex gap-3 px-6 pb-6 flex-1 min-h-0 overflow-x-auto">
          {TIERS.map(tier => {
            const cols = byTier[tier]
            const colors = tierColors[tier]
            return (
              <div key={tier} className={`flex flex-col flex-1 min-w-[220px] border-2 border-border-dim ${colors.bg}`}>
                {/* Column header */}
                <div className={`flex items-center justify-between px-3 py-2 border-b-2 ${colors.header} shrink-0`}>
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-[10px] text-text-primary uppercase">{t(`knowledgeBase:tier.${tier}`)}</span>
                    <PixelBadge variant={colors.badge}>{cols.length}</PixelBadge>
                  </div>
                  <PixelButton size="sm" variant="ghost" onClick={() => setNewModalTier(tier)}>+</PixelButton>
                </div>

                {/* Hot capacity indicator */}
                {tier === 'hot' && (
                  <div className="px-3 py-1.5 border-b-2 border-border-dim">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-text-dim">{t('knowledgeBase:tier.capacity')}</span>
                      <span className="text-[10px] text-text-secondary font-mono">
                        {Math.round(hotTotalChars / 1000)}K / {HOT_CHAR_LIMIT / 1000}K
                      </span>
                    </div>
                    <PixelProgress value={(hotTotalChars / HOT_CHAR_LIMIT) * 100} />
                  </div>
                )}

                {/* Collection cards */}
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                  {cols.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-[11px] text-text-dim">{t('knowledgeBase:tier.empty')}</p>
                    </div>
                  ) : (
                    cols.map(col => (
                      <PixelCard
                        key={col.id}
                        data-testid="kb-collection-card"
                        className="cursor-pointer hover:border-border-bright transition-colors"
                        onClick={() => setSelectedCollection(col)}
                      >
                        <p className="font-pixel text-[10px] text-text-primary truncate">{col.name}</p>
                        {col.description && (
                          <p className="text-[11px] text-text-secondary mt-1 line-clamp-2">{col.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-text-dim">
                          <span>{t('knowledgeBase:collection.docs', { count: col.documentCount })}</span>
                          <span>{Math.round(col.totalChars / 1000)}K {t('knowledgeBase:collection.chars')}</span>
                        </div>
                        <div className="text-[9px] text-text-dim mt-1">{relativeTime(col.updatedAt, t)}</div>
                      </PixelCard>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </motion.div>
      )}

      {/* New collection modal */}
      {newModalTier && (
        <NewCollectionModal
          open
          defaultTier={newModalTier}
          onClose={handleCloseNew}
        />
      )}

      {/* Collection detail modal */}
      {selectedCollection && (
        <CollectionDetailModal
          open
          collection={selectedCollection}
          onClose={handleCloseDetail}
        />
      )}
    </motion.div>
  )
}
