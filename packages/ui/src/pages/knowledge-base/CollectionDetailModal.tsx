import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { KBCollection, KBCollectionTier, KBDocument, KBSearchResult } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import {
  PixelModal, PixelButton, PixelBadge, PixelInput, PixelCard, PixelSpinner,
} from '../../components'
import { relativeTime } from '../../lib/time'
import { IngestTextModal } from './IngestTextModal'
import { UploadFileModal } from './UploadFileModal'
import { DocumentViewModal } from './DocumentViewModal'

const TIERS: KBCollectionTier[] = ['hot', 'warm', 'cold', 'archive']

const tierBadgeVariant: Record<KBCollectionTier, 'error' | 'paused' | 'info' | 'idle'> = {
  hot: 'error', warm: 'paused', cold: 'info', archive: 'idle',
}

interface CollectionDetailModalProps {
  open: boolean
  collection: KBCollection
  onClose: () => void
}

export function CollectionDetailModal({ open, collection, onClose }: CollectionDetailModalProps) {
  const { t } = useTranslation(['knowledgeBase', 'common'])
  const allDocuments = useAppStore(s => s.kbDocuments)
  const documents = useMemo(
    () => allDocuments.filter(d => d.collectionId === collection.id),
    [allDocuments, collection.id],
  )
  const docsLoading = useAppStore(s => s.kbDocumentsLoading)
  const loadKBDocuments = useAppStore(s => s.loadKBDocuments)
  const deleteKBDocument = useAppStore(s => s.deleteKBDocument)
  const updateKBCollection = useAppStore(s => s.updateKBCollection)
  const deleteKBCollection = useAppStore(s => s.deleteKBCollection)
  const searchKB = useAppStore(s => s.searchKB)

  const [showIngestText, setShowIngestText] = useState(false)
  const [showUploadFile, setShowUploadFile] = useState(false)
  const [viewDoc, setViewDoc] = useState<KBDocument | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KBSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const loadedRef = useRef<string | null>(null)
  useEffect(() => {
    if (loadedRef.current === collection.id) return
    loadedRef.current = collection.id
    loadKBDocuments(collection.id)
  }, [collection.id, loadKBDocuments])

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await searchKB(searchQuery.trim(), { collectionId: collection.id, limit: 10 })
      setSearchResults(results)
    } finally {
      setSearching(false)
    }
  }

  async function handleTierChange(tier: KBCollectionTier) {
    await updateKBCollection(collection.id, { tier })
    // Collection will be updated in store; close and reopen from parent will show new tier
  }

  async function handleDeleteCollection() {
    await deleteKBCollection(collection.id)
    onClose()
  }

  return (
    <>
      <PixelModal
        open={open}
        onClose={onClose}
        title={collection.name}
        size="xl"
      >
        <div className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto">
          {/* Collection info */}
          <div className="flex items-center gap-3 flex-wrap">
            <PixelBadge variant={tierBadgeVariant[collection.tier]}>
              {t(`knowledgeBase:tier.${collection.tier}`)}
            </PixelBadge>
            <span className="text-[11px] text-text-dim">
              {t('knowledgeBase:collection.docs', { count: collection.documentCount })}
            </span>
            <span className="text-[11px] text-text-dim">
              {Math.round(collection.totalChars / 1000)}K {t('knowledgeBase:collection.chars')}
            </span>
            {collection.description && (
              <span className="text-[11px] text-text-secondary">{collection.description}</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <PixelButton size="sm" variant="primary" onClick={() => setShowIngestText(true)}>
              {t('knowledgeBase:detail.addText')}
            </PixelButton>
            <PixelButton size="sm" variant="secondary" onClick={() => setShowUploadFile(true)}>
              {t('knowledgeBase:detail.uploadFile')}
            </PixelButton>
          </div>

          {/* Search test */}
          <div className="border-2 border-border-dim p-3">
            <label className="font-pixel text-[10px] text-text-secondary mb-2 block">{t('knowledgeBase:detail.searchTest')}</label>
            <div className="flex gap-2">
              <PixelInput
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('knowledgeBase:detail.searchPlaceholder')}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                className="flex-1"
              />
              <PixelButton size="sm" variant="secondary" disabled={!searchQuery.trim() || searching} onClick={handleSearch}>
                {t('knowledgeBase:detail.searchBtn')}
              </PixelButton>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {searchResults.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-deep border border-border-dim">
                    <span className="text-[10px] text-accent-blue font-mono shrink-0">{(r.score * 100).toFixed(0)}%</span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-text-primary font-pixel truncate">{r.collectionName}</p>
                      <p className="text-[10px] text-text-secondary line-clamp-2">{r.chunkContent}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Document list */}
          <div>
            <h3 className="font-pixel text-[10px] text-text-secondary mb-2">{t('knowledgeBase:detail.documents')}</h3>
            {docsLoading ? (
              <PixelSpinner label={t('knowledgeBase:loading')} />
            ) : documents.length === 0 ? (
              <p className="text-[11px] text-text-dim py-4 text-center">{t('knowledgeBase:detail.noDocs')}</p>
            ) : (
              <div className="flex flex-col gap-1">
                {documents.map(doc => (
                  <PixelCard key={doc.id} className="!p-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-text-primary truncate">{doc.title || t('knowledgeBase:document.untitled')}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-dim">
                          <PixelBadge variant="idle">{doc.sourceType}</PixelBadge>
                          {doc.sourceName && <span className="font-mono truncate">{doc.sourceName}</span>}
                          <span>{Math.round(doc.charCount / 1000)}K</span>
                          {doc.chunkCount > 0 && <span>{doc.chunkCount} {t('knowledgeBase:document.chunks')}</span>}
                          <span className="ml-auto shrink-0">{relativeTime(doc.createdAt, t)}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <PixelButton size="sm" variant="ghost" onClick={() => setViewDoc(doc)}>{t('common:button.view')}</PixelButton>
                        <PixelButton size="sm" variant="ghost" onClick={() => deleteKBDocument(doc.id)}>&times;</PixelButton>
                      </div>
                    </div>
                  </PixelCard>
                ))}
              </div>
            )}
          </div>

          {/* Settings section */}
          <div className="border-t-2 border-border-dim pt-3">
            <h3 className="font-pixel text-[10px] text-text-secondary mb-2">{t('knowledgeBase:detail.settings')}</h3>
            <div className="flex flex-col gap-3">
              {/* Tier selector */}
              <div>
                <label className="block text-[10px] text-text-dim mb-1">{t('knowledgeBase:detail.changeTier')}</label>
                <div className="flex gap-2">
                  {TIERS.map(t_tier => (
                    <button
                      key={t_tier}
                      type="button"
                      onClick={() => handleTierChange(t_tier)}
                      className={`px-3 py-1.5 font-pixel text-[9px] uppercase border-2 cursor-pointer transition-colors ${
                        collection.tier === t_tier
                          ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                          : 'bg-elevated border-border-dim text-text-secondary hover:border-border-bright'
                      }`}
                    >
                      {t(`knowledgeBase:tier.${t_tier}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delete */}
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-accent-red">{t('knowledgeBase:detail.confirmDelete')}</span>
                    <PixelButton size="sm" variant="primary" onClick={handleDeleteCollection}>{t('common:button.confirm')}</PixelButton>
                    <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>{t('common:button.cancel')}</PixelButton>
                  </div>
                ) : (
                  <PixelButton size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                    {t('knowledgeBase:detail.deleteCollection')}
                  </PixelButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </PixelModal>

      {/* Sub-modals */}
      {showIngestText && (
        <IngestTextModal open collectionId={collection.id} onClose={() => setShowIngestText(false)} />
      )}
      {showUploadFile && (
        <UploadFileModal open collectionId={collection.id} onClose={() => setShowUploadFile(false)} />
      )}
      {viewDoc && (
        <DocumentViewModal open document={viewDoc} onClose={() => setViewDoc(null)} />
      )}
    </>
  )
}
