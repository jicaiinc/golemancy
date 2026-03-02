import { useTranslation } from 'react-i18next'
import type { KBDocument } from '@golemancy/shared'
import { PixelModal, PixelButton, PixelBadge } from '../../components'
import { relativeTime } from '../../lib/time'

interface DocumentViewModalProps {
  open: boolean
  document: KBDocument
  onClose: () => void
}

export function DocumentViewModal({ open, document: doc, onClose }: DocumentViewModalProps) {
  const { t } = useTranslation(['knowledgeBase', 'common'])

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={doc.title || t('knowledgeBase:document.untitled')}
      size="lg"
      footer={
        <PixelButton variant="ghost" onClick={onClose}>{t('common:button.close')}</PixelButton>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-text-dim">
          <PixelBadge variant="info">{doc.sourceType}</PixelBadge>
          {doc.sourceName && <span className="font-mono">{doc.sourceName}</span>}
          <span>{Math.round(doc.charCount / 1000)}K {t('knowledgeBase:collection.chars')}</span>
          {doc.chunkCount > 0 && <span>{doc.chunkCount} {t('knowledgeBase:document.chunks')}</span>}
          <span>{relativeTime(doc.createdAt, t)}</span>
        </div>

        {/* Content */}
        <div className="max-h-[50vh] overflow-y-auto bg-deep border-2 border-border-dim p-3">
          <pre className="text-[12px] text-text-primary font-mono whitespace-pre-wrap break-words">{doc.content}</pre>
        </div>
      </div>
    </PixelModal>
  )
}
