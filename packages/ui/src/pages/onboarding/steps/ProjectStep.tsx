import { useTranslation } from 'react-i18next'
import { getProjectTemplate } from '@golemancy/shared'
import { PixelCard, PixelInput, PixelTextArea, TemplateSelector } from '../../../components'

const ICONS = [
  { id: 'pickaxe', label: '\u26CF' },
  { id: 'sword', label: '\u2694' },
  { id: 'shield', label: '\uD83D\uDEE1' },
  { id: 'book', label: '\uD83D\uDCD6' },
  { id: 'star', label: '\u2B50' },
  { id: 'gem', label: '\uD83D\uDC8E' },
  { id: 'flame', label: '\uD83D\uDD25' },
  { id: 'bolt', label: '\u26A1' },
]

interface ProjectStepProps {
  projectName: string
  projectDescription: string
  projectIcon: string
  selectedTemplateId: string | null
  onUpdate: (data: {
    projectName?: string
    projectDescription?: string
    projectIcon?: string
    selectedTemplateId?: string | null
  }) => void
}

export function ProjectStep({
  projectName,
  projectDescription,
  projectIcon,
  selectedTemplateId,
  onUpdate,
}: ProjectStepProps) {
  const { t } = useTranslation('onboarding')

  function handleTemplateSelect(templateId: string | null) {
    if (templateId) {
      const template = getProjectTemplate(templateId)
      if (template) {
        onUpdate({
          selectedTemplateId: templateId,
          projectName: template.name,
          projectIcon: template.icon,
        })
        return
      }
    }
    onUpdate({ selectedTemplateId: null })
  }

  return (
    <div className="flex flex-col gap-6" data-testid="onboarding-project-step">
      <div className="text-center">
        <h2 className="font-pixel text-[14px] text-text-primary mb-2">{t('project.heading')}</h2>
        <p className="font-mono text-[11px] text-text-dim">{t('project.description')}</p>
      </div>

      <TemplateSelector
        selectedTemplateId={selectedTemplateId}
        onSelect={handleTemplateSelect}
      />

      <PixelCard>
        <div className="flex flex-col gap-4">
          <PixelInput
            data-testid="onboarding-project-name-input"
            label={t('project.labelName')}
            value={projectName}
            onChange={e => onUpdate({ projectName: e.target.value })}
            placeholder={t('project.placeholderName')}
          />

          <PixelTextArea
            label={t('project.labelDescription')}
            value={projectDescription}
            onChange={e => onUpdate({ projectDescription: e.target.value })}
            placeholder={t('project.placeholderDescription')}
          />

          {/* Icon picker */}
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">
              {t('project.labelIcon')}
            </label>
            <div className="flex gap-2">
              {ICONS.map(ic => (
                <button
                  key={ic.id}
                  onClick={() => onUpdate({ projectIcon: ic.id })}
                  className={`w-10 h-10 flex items-center justify-center text-[18px] border-2 cursor-pointer transition-colors ${
                    projectIcon === ic.id
                      ? 'bg-accent-green/15 border-accent-green'
                      : 'bg-deep border-border-dim hover:border-border-bright'
                  }`}
                >
                  {ic.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PixelCard>
    </div>
  )
}
