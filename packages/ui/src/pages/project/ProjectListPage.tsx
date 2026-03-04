import { useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import { PixelButton, PixelCard, PixelBadge, PixelSpinner, OpenExternalIcon, CopyIcon } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { GlobalLayout } from '../../app/layouts/GlobalLayout'
import { ProjectCreateModal } from './ProjectCreateModal'
import { relativeTime } from '../../lib/time'
import { getCloneName } from '../../lib/clone-name'

const iconMap: Record<string, string> = {
  pickaxe: '⛏',
  sword: '⚔',
  shield: '🛡',
  book: '📖',
  star: '⭐',
  gem: '💎',
  flame: '🔥',
  bolt: '⚡',
}

export function ProjectListPage() {
  const { t } = useTranslation('project')
  const projects = useAppStore(s => s.projects)
  const projectsLoading = useAppStore(s => s.projectsLoading)
  const cloneProject = useAppStore(s => s.cloneProject)
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <PixelSpinner />
      </div>
    )
  }

  return (
    <GlobalLayout>
      <div className="max-w-[1200px] mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-pixel text-[12px] text-text-primary">{t('list.title')}</h2>
            <p className="mt-2 text-text-secondary text-[13px]">
              {t('list.subtitle', { count: projects.length })}
            </p>
          </div>
          <PixelButton data-testid="create-project-btn" variant="primary" onClick={() => setShowCreate(true)}>
            {t('list.newBtn')}
          </PixelButton>
        </div>

        {/* Project grid */}
        {projects.length === 0 ? (
          <PixelCard variant="outlined" className="text-center py-12">
            <div className="font-arcade text-[20px] text-text-dim mb-4">⛏</div>
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
            {projects.map(project => (
              <motion.div key={project.id} {...staggerItem} className="h-full">
                <PixelCard
                  data-testid={`project-item-${project.id}`}
                  variant="interactive"
                  className="group h-full flex flex-col"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-deep border-2 border-border-dim text-[18px] shrink-0">
                      {iconMap[project.icon] ?? '📁'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-pixel text-[10px] text-text-primary truncate">
                        {project.name}
                      </h3>
                      <p className="text-[12px] text-text-secondary mt-1 line-clamp-2">
                        {project.description}
                      </p>
                    </div>
                    <button
                      className="text-text-dim hover:text-accent-blue transition-colors p-1 shrink-0"
                      title={t('list.clone')}
                      onClick={(e) => {
                        e.stopPropagation()
                        cloneProject(project.id, getCloneName(project.name, projects.map(p => p.name)))
                      }}
                    >
                      <CopyIcon className="w-[14px] h-[14px]" />
                    </button>
                    {window.electronAPI?.openNewWindow && (
                      <button
                        className="text-text-dim hover:text-accent-blue transition-colors p-1 shrink-0"
                        title={t('list.openInWindow')}
                        onClick={(e) => {
                          e.stopPropagation()
                          window.electronAPI!.openNewWindow(project.id)
                        }}
                      >
                        <OpenExternalIcon className="w-[14px] h-[14px]" />
                      </button>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 mt-auto pt-3 border-t-2 border-border-dim">
                    <span className="text-[11px] text-text-dim">
                      {t('list.agents', { count: project.agentCount })}
                    </span>
                    {project.activeAgentCount > 0 && (
                      <PixelBadge variant="running">
                        {t('list.running', { count: project.activeAgentCount })}
                      </PixelBadge>
                    )}
                    <span className="ml-auto text-[11px] text-text-dim">
                      {relativeTime(project.lastActivityAt)}
                    </span>
                  </div>
                </PixelCard>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <ProjectCreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </GlobalLayout>
  )
}
