import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KBCollectionId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { PixelModal, PixelButton, PixelInput, PixelDropZone } from '../../components'

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md']

interface UploadFileModalProps {
  open: boolean
  collectionId: KBCollectionId
  onClose: () => void
}

export function UploadFileModal({ open, collectionId, onClose }: UploadFileModalProps) {
  const { t } = useTranslation(['knowledgeBase', 'common'])
  const uploadKBDocument = useAppStore(s => s.uploadKBDocument)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!file || submitting) return
    setSubmitting(true)
    try {
      await uploadKBDocument(collectionId, file, title.trim() ? { title: title.trim() } : undefined)
      onClose()
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
          <PixelButton variant="primary" disabled={!file || submitting} onClick={handleSubmit}>
            {t('knowledgeBase:uploadFile.submit')}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelDropZone
          accept={ACCEPTED_EXTENSIONS}
          onDrop={(files) => { if (files[0]) setFile(files[0]) }}
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
