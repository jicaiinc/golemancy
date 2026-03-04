import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import { PixelButton, PixelCard, PixelSpinner, CopyIcon } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { TeamCreateModal } from './TeamCreateModal'
import { getCloneName } from '../../lib/clone-name'

export function TeamListPage() {
  const { t } = useTranslation('team')
  const { projectId } = useParams<{ projectId: string }>()
  const teams = useAppStore(s => s.teams)
  const teamsLoading = useAppStore(s => s.teamsLoading)
  const agents = useAppStore(s => s.agents)
  const cloneTeam = useAppStore(s => s.cloneTeam)
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  if (teamsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">{t('list.title')}</h1>
          <p className="mt-1 text-text-secondary text-[13px]">
            {t('list.subtitle', { count: teams.length })}
          </p>
        </div>
        <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
          {t('list.newBtn')}
        </PixelButton>
      </div>

      {/* Team grid */}
      {teams.length === 0 ? (
        <PixelCard variant="outlined" className="text-center py-12">
          <div className="font-arcade text-[20px] text-text-dim mb-4">{'&&'}</div>
          <p className="font-pixel text-[10px] text-text-secondary mb-4">{t('list.empty')}</p>
          <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
            {t('list.createFirst')}
          </PixelButton>
        </PixelCard>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          {...staggerContainer}
          initial="initial"
          animate="animate"
        >
          {teams.map(team => {
            const leader = team.members.find(m => !m.parentAgentId)
            const leaderAgent = leader ? agents.find(a => a.id === leader.agentId) : undefined
            return (
              <motion.div key={team.id} {...staggerItem} className="h-full">
                <PixelCard
                  variant="interactive"
                  className="relative overflow-hidden group h-full flex flex-col"
                  onClick={() => navigate(`/projects/${projectId}/teams/${team.id}`)}
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-accent-blue" />

                  <div className="mt-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-pixel text-[10px] text-text-primary truncate">{team.name}</h3>
                      <button
                        className="ml-auto text-text-dim hover:text-accent-blue transition-colors p-1 shrink-0 opacity-0 group-hover:opacity-100"
                        title={t('list.clone')}
                        onClick={(e) => {
                          e.stopPropagation()
                          cloneTeam(team.id, getCloneName(team.name, teams.map(t => t.name)))
                        }}
                      >
                        <CopyIcon className="w-[14px] h-[14px]" />
                      </button>
                    </div>
                    <p className="text-[12px] text-text-secondary mt-1 line-clamp-2">
                      {team.description}
                    </p>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-3 mt-auto pt-3 border-t-2 border-border-dim">
                    <span className="text-[11px] text-text-dim">
                      {t('list.members', { count: team.members.length })}
                    </span>
                    {leaderAgent && (
                      <span className="ml-auto text-[11px] text-text-dim font-mono">
                        {t('list.leader')}: {leaderAgent.name}
                      </span>
                    )}
                  </div>
                </PixelCard>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <TeamCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
