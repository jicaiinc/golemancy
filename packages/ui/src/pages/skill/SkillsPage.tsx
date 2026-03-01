import { useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { Skill, SkillId } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import { useCurrentProject } from '../../hooks'
import {
  PixelCard, PixelButton, PixelTabs, PixelSpinner, PixelDropZone,
} from '../../components'
import { staggerContainer, staggerItem } from '../../lib/motion'
import { SkillFormModal } from './SkillFormModal'

export function SkillsPage() {
  const { t } = useTranslation(['skill', 'common'])
  const project = useCurrentProject()
  const skills = useAppStore(s => s.skills)
  const skillsLoading = useAppStore(s => s.skillsLoading)
  const agents = useAppStore(s => s.agents)
  const createSkill = useAppStore(s => s.createSkill)
  const updateSkill = useAppStore(s => s.updateSkill)
  const deleteSkill = useAppStore(s => s.deleteSkill)

  const tabs = [
    { id: 'installed', label: t('skill:tabs.installed') },
    { id: 'marketplace', label: t('skill:tabs.marketplace') },
  ]

  const [activeTab, setActiveTab] = useState('installed')
  const [showCreate, setShowCreate] = useState(false)
  const [editSkill, setEditSkill] = useState<Skill | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  if (!project) return null

  function getReferencingAgentCount(skillId: SkillId): number {
    return agents.filter(a => a.skillIds.includes(skillId)).length
  }

  async function handleDelete(skill: Skill) {
    const refCount = getReferencingAgentCount(skill.id)
    if (refCount > 0) {
      setDeleteError(t('skill:deleteError.inUse', { name: skill.name, count: refCount }))
      return
    }
    setDeleteError(null)
    try {
      await deleteSkill(skill.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('skill:deleteError.generic')
      setDeleteError(message)
    }
  }

  const handleSkillDrop = useCallback(async (files: File[]) => {
    setImportStatus(null)
    const mdFiles = files.filter(f => f.name.toLowerCase().endsWith('.md'))
    const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'))

    if (mdFiles.length === 0 && zipFiles.length === 0) {
      setImportStatus({ type: 'error', message: t('skill:import.noValidFiles') })
      return
    }

    try {
      let totalImported = 0

      // Handle .md files
      if (mdFiles.length > 0) {
        await Promise.all(mdFiles.map(async (file) => {
          const content = await file.text()
          const name = file.name.replace(/\.md$/i, '').replace(/[-_]/g, ' ')
          return createSkill({ name, description: '', instructions: content })
        }))
        totalImported += mdFiles.length
      }

      // Handle .zip files
      const importSkillsFromZip = useAppStore.getState().importSkillsFromZip
      for (const zipFile of zipFiles) {
        const result = await importSkillsFromZip(zipFile)
        totalImported += result.count
      }

      setImportStatus({ type: 'success', message: t('skill:import.importedCount', { count: totalImported }) })
    } catch (err) {
      const message = err instanceof Error ? err.message : t('skill:import.importError')
      setImportStatus({ type: 'error', message })
    }
  }, [createSkill, t])

  return (
    <motion.div className="p-6" data-testid="skills-page" {...staggerContainer} initial="initial" animate="animate">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-pixel text-[14px] text-text-primary">{t('skill:page.title')}</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            {t('skill:page.skillCount', { count: skills.length })}
          </p>
        </div>
        <PixelButton variant="primary" data-testid="skill-new-btn" onClick={() => setShowCreate(true)}>{t('skill:page.newSkillBtn')}</PixelButton>
      </div>

      {/* Drop zone for skill import */}
      <PixelDropZone accept={['.md', '.zip']} onDrop={handleSkillDrop} className="mb-4" />

      {/* Import status */}
      {importStatus && (
        <div className="mb-4">
          <PixelCard className={importStatus.type === 'error' ? 'bg-accent-red/10 border-accent-red' : 'bg-accent-green/10 border-accent-green'}>
            <div className="flex items-center justify-between">
              <span className={`text-[12px] ${importStatus.type === 'error' ? 'text-accent-red' : 'text-accent-green'}`}>
                {importStatus.message}
              </span>
              <PixelButton size="sm" variant="ghost" onClick={() => setImportStatus(null)}>&times;</PixelButton>
            </div>
          </PixelCard>
        </div>
      )}

      {/* Tabs */}
      <PixelTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} testIdPrefix="skill" />

      <div className="mt-4">
        {activeTab === 'installed' && (
          <>
            {/* Delete error */}
            {deleteError && (
              <motion.div {...staggerItem} className="mb-4">
                <PixelCard className="bg-accent-red/10 border-accent-red">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-accent-red">{deleteError}</span>
                    <PixelButton size="sm" variant="ghost" onClick={() => setDeleteError(null)}>&times;</PixelButton>
                  </div>
                </PixelCard>
              </motion.div>
            )}

            {skillsLoading ? (
              <div className="flex justify-center py-12">
                <PixelSpinner label={t('skill:loading')} />
              </div>
            ) : skills.length === 0 ? (
              <motion.div {...staggerItem}>
                <PixelCard variant="outlined" className="text-center py-12">
                  <div className="font-arcade text-[20px] text-text-dim mb-4">&lt;&gt;</div>
                  <p className="font-pixel text-[10px] text-text-secondary mb-4">{t('skill:empty.title')}</p>
                  <PixelButton variant="primary" onClick={() => setShowCreate(true)}>
                    {t('skill:empty.createFirstBtn')}
                  </PixelButton>
                </PixelCard>
              </motion.div>
            ) : (
              <div className="flex flex-col gap-2">
                {skills.map(skill => (
                  <motion.div key={skill.id} {...staggerItem}>
                    <PixelCard data-testid="skill-card">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-pixel text-[10px] text-accent-cyan">{skill.name}</h3>
                          <p className="text-[12px] text-text-secondary mt-1 line-clamp-2">{skill.description}</p>
                          {skill.instructions && (
                            <p className="text-[11px] text-text-dim font-mono mt-1 line-clamp-1">{skill.instructions}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <PixelButton size="sm" variant="ghost" onClick={() => setEditSkill(skill)}>{t('common:button.edit')}</PixelButton>
                          <PixelButton size="sm" variant="ghost" onClick={() => handleDelete(skill)}>&times;</PixelButton>
                        </div>
                      </div>
                    </PixelCard>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'marketplace' && (
          <motion.div {...staggerItem}>
            <PixelCard variant="outlined" className="text-center py-12">
              <p className="font-pixel text-[12px] text-text-dim animate-[pixel-blink_2s_steps(2)_infinite]">
                {t('skill:comingSoon')}
              </p>
            </PixelCard>
          </motion.div>
        )}
      </div>

      {/* Create modal */}
      <SkillFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={async (name, description, instructions) => {
          await createSkill({ name, description, instructions })
          setShowCreate(false)
        }}
        title={t('skill:form.newTitle')}
      />

      {/* Edit modal */}
      {editSkill && (
        <SkillFormModal
          open
          onClose={() => setEditSkill(null)}
          onSubmit={async (name, description, instructions) => {
            await updateSkill(editSkill.id, { name, description, instructions })
            setEditSkill(null)
          }}
          title={t('skill:form.editTitle')}
          initialName={editSkill.name}
          initialDescription={editSkill.description}
          initialInstructions={editSkill.instructions}
        />
      )}
    </motion.div>
  )
}
