import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KBCollectionId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { PixelModal, PixelButton, PixelInput, PixelTextArea } from '../../components'

interface IngestTextModalProps {
  open: boolean
  collectionId: KBCollectionId
  onClose: () => void
}

export function IngestTextModal({ open, collectionId, onClose }: IngestTextModalProps) {
  const { t } = useTranslation(['knowledgeBase', 'common'])
  const ingestKBDocument = useAppStore(s => s.ingestKBDocument)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!content.trim() || submitting) return
    setSubmitting(true)
    try {
      await ingestKBDocument(collectionId, {
        title: title.trim() || undefined,
        content: content.trim(),
        sourceType: 'manual',
      })
      onClose()
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
          <PixelButton variant="primary" disabled={!content.trim() || submitting} onClick={handleSubmit}>
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
          onChange={e => setContent(e.target.value)}
          placeholder={t('knowledgeBase:ingestText.contentPlaceholder')}
          rows={8}
        />
      </div>
    </PixelModal>
  )
}
