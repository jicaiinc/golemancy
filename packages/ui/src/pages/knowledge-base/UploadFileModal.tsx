import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KBCollectionId, KBCollectionTier } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import { PixelModal, PixelButton, PixelInput, PixelDropZone } from '../../components'
import { parseErrorMessage } from '../../lib/parse-error'
import { resolveEmbeddingConfig } from '../../lib/embedding'

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md']

interface UploadFileModalProps {
  open: boolean
  collectionId: KBCollectionId
  tier?: KBCollectionTier
  onClose: () => void
}

export function UploadFileModal({ open, collectionId, tier, onClose }: UploadFileModalProps) {
  const { t } = useTranslation(['knowledgeBase', 'common'])
  const uploadKBDocument = useAppStore(s => s.uploadKBDocument)
  const settings = useAppStore(s => s.settings)
  const project = useCurrentProject()
  const embeddingConfigured = !!resolveEmbeddingConfig(settings, project?.config)
  const needsEmbedding = tier === 'warm' || tier === 'cold'
  const submitDisabled = needsEmbedding && !embeddingConfigured

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!file || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await uploadKBDocument(collectionId, file, title.trim() ? { title: title.trim() } : undefined)
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
      title={t('knowledgeBase:uploadFile.title')}
      size="md"
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose}>{t('common:button.cancel')}</PixelButton>
          <PixelButton variant="primary" disabled={!file || submitting || submitDisabled} onClick={handleSubmit}>
            {t('knowledgeBase:uploadFile.submit')}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelDropZone
          accept={ACCEPTED_EXTENSIONS}
          onDrop={(files) => { if (files[0]) { setFile(files[0]); setError(null) } }}
        >
          {file ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-text-primary font-mono">{file.name}</span>
              <span className="text-[10px] text-text-dim">({Math.round(file.size / 1024)} KB)</span>
              <PixelButton size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setFile(null) }}>&times;</PixelButton>
            </div>
          ) : (
            <p className="text-[11px] text-text-secondary">
              {t('knowledgeBase:uploadFile.dropHint', { formats: ACCEPTED_EXTENSIONS.join(', ') })}
            </p>
          )}
        </PixelDropZone>
        {submitDisabled && <p className="text-[10px] text-accent-amber">{t('knowledgeBase:detail.embeddingRequiredForWarmCold')}</p>}
        {error && <p className="text-[11px] text-accent-red">{error}</p>}
        <PixelInput
          label={t('knowledgeBase:uploadFile.titleLabel')}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('knowledgeBase:uploadFile.titlePlaceholder')}
        />
      </div>
    </PixelModal>
  )
}
