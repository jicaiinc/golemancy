import { useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { useAppStore } from '../../stores'
import { PixelButton, PixelCard, PixelBadge, PixelSpinner, OpenExternalIcon } from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { GlobalLayout } from '../../app/layouts/GlobalLayout'
import { ProjectCreateModal } from './ProjectCreateModal'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

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
  const projects = useAppStore(s => s.projects)
  const projectsLoading = useAppStore(s => s.projectsLoading)
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
    <GlobalLayout
      title="SoloCraft"
      actions={
        <PixelButton variant="ghost" size="sm" onClick={() => navigate('/settings')}>
          ⚙
        </PixelButton>
      }
    >
      <div className="max-w-[1200px] mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-pixel text-[12px] text-text-primary">Your Projects</h2>
            <p className="mt-2 text-text-secondary text-[13px]">
              {projects.length} project{projects.length !== 1 ? 's' : ''} in your workspace
            </p>
          </div>
          <PixelButton data-testid="create-project-btn" variant="primary" onClick={() => setShowCreate(true)}>
            + New Project
          </PixelButton>
        </div>

        {/* Project grid */}
        {projects.length === 0 ? (
          <PixelCard variant="outlined" className="text-center py-12">
            <div className="font-pixel text-[20px] text-text-dim mb-4">⛏</div>
            <p className="font-pixel text-[10px] text-text-secondary mb-4">No projects yet</p>
            <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
              Create Your First Project
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
                    {window.electronAPI?.openNewWindow && (
                      <button
                        className="text-text-dim hover:text-accent-blue transition-colors p-1 shrink-0"
                        title="Open in New Window"
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
                      {project.agentCount} agent{project.agentCount !== 1 ? 's' : ''}
                    </span>
                    {project.activeAgentCount > 0 && (
                      <PixelBadge variant="running">
                        {project.activeAgentCount} running
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
