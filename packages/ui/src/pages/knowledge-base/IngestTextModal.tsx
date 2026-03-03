import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KBCollectionId, KBCollectionTier } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelModal, PixelButton, PixelInput, PixelTextArea } from '../../components'
import { parseErrorMessage } from '../../lib/parse-error'
import { resolveEmbeddingConfig } from '../../lib/embedding'

interface IngestTextModalProps {
  open: boolean
  collectionId: KBCollectionId
  tier?: KBCollectionTier
  onClose: () => void
}

export function IngestTextModal({ open, collectionId, tier, onClose }: IngestTextModalProps) {
  const { t } = useTranslation(['knowledgeBase', 'common'])
  const ingestKBDocument = useAppStore(s => s.ingestKBDocument)
  const settings = useAppStore(s => s.settings)
  const project = useCurrentProject()
  const embeddingConfigured = !!resolveEmbeddingConfig(settings, project?.config)
  const needsEmbedding = tier === 'warm' || tier === 'cold'
  const submitDisabled = needsEmbedding && !embeddingConfigured

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!content.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await ingestKBDocument(collectionId, {
        title: title.trim() || undefined,
        content: content.trim(),
        sourceType: 'manual',
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? parseErrorMessage(err) : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={t('knowledgeBase:ingestText.title')}
      size="lg"
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose}>{t('common:button.cancel')}</PixelButton>
          <PixelButton variant="primary" disabled={!content.trim() || submitting || submitDisabled} onClick={handleSubmit}>
            {t('knowledgeBase:ingestText.submit')}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput
          label={t('knowledgeBase:ingestText.titleLabel')}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('knowledgeBase:ingestText.titlePlaceholder')}
          autoFocus
        />
        <PixelTextArea
          label={t('knowledgeBase:ingestText.contentLabel')}
          value={content}
          onChange={e => { setContent(e.target.value); setError(null) }}
          placeholder={t('knowledgeBase:ingestText.contentPlaceholder')}
          rows={8}
        />
        {submitDisabled && <p className="text-[10px] text-accent-amber">{t('knowledgeBase:detail.embeddingRequiredForWarmCold')}</p>}
        {error && <p className="text-[11px] text-accent-red">{error}</p>}
      </div>
    </PixelModal>
  )
}
