import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KBCollectionTier } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { PixelModal, PixelButton, PixelInput, PixelTextArea } from '../../components'

const TIERS: KBCollectionTier[] = ['hot', 'warm', 'cold', 'archive']

interface NewCollectionModalProps {
  open: boolean
  defaultTier: KBCollectionTier
  onClose: () => void
}

export function NewCollectionModal({ open, defaultTier, onClose }: NewCollectionModalProps) {
  const { t } = useTranslation(['knowledgeBase', 'common'])
  const createKBCollection = useAppStore(s => s.createKBCollection)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tier, setTier] = useState<KBCollectionTier>(defaultTier)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    try {
      await createKBCollection({ name: name.trim(), description: description.trim() || undefined, tier })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PixelModal
      open={open}
      onClose={onClose}
      title={t('knowledgeBase:newCollection.title')}
      size="md"
      footer={
        <>
          <PixelButton variant="ghost" onClick={onClose}>{t('common:button.cancel')}</PixelButton>
          <PixelButton variant="primary" disabled={!name.trim() || submitting} onClick={handleSubmit}>
            {t('common:button.create')}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelInput
          label={t('knowledgeBase:newCollection.nameLabel')}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('knowledgeBase:newCollection.namePlaceholder')}
          autoFocus
        />
        <PixelTextArea
          label={t('knowledgeBase:newCollection.descriptionLabel')}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t('knowledgeBase:newCollection.descriptionPlaceholder')}
          rows={2}
        />
        <div>
          <label className="block font-pixel text-[10px] text-text-secondary mb-2">{t('knowledgeBase:newCollection.tierLabel')}</label>
          <div className="flex gap-2">
            {TIERS.map(t_tier => (
              <button
                key={t_tier}
                type="button"
                onClick={() => setTier(t_tier)}
                className={`px-3 py-1.5 font-pixel text-[9px] uppercase border-2 cursor-pointer transition-colors ${
                  tier === t_tier
                    ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                    : 'bg-elevated border-border-dim text-text-secondary hover:border-border-bright'
                }`}
              >
                {t(`knowledgeBase:tier.${t_tier}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </PixelModal>
  )
}
