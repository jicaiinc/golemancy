import { useParams, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import { PixelButton } from '../../components'
import { TeamTopologyView } from './topology/TeamTopologyView'

export function TeamDetailPage() {
  const { t } = useTranslation('team')
  const { projectId, teamId } = useParams<{ projectId: string; teamId: string }>()
  const teams = useAppStore(s => s.teams)
  const teamsLoading = useAppStore(s => s.teamsLoading)
  const navigate = useNavigate()

  const team = teams.find(t => t.id === teamId)

  if (teamsLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center">
        <span className="text-text-dim text-[12px]">{t('common:status.loading')}</span>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="p-6">
        <p className="text-text-dim">{t('detail.notFound')}</p>
        <PixelButton
          variant="ghost"
          className="mt-2"
          onClick={() => navigate(`/projects/${projectId}/teams`)}
        >
          {t('detail.backBtn')}
        </PixelButton>
      </div>
    )
  }

  return (
    <div className="flex-1 h-full flex flex-col">
      <TeamTopologyView team={team} />
    </div>
  )
}
