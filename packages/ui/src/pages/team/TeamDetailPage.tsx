import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { AgentId, TeamMember } from '@golemancy/shared'
import { useAppStore } from '../../stores'
import {
  PixelButton, PixelCard, PixelTabs,
  PixelInput, PixelTextArea,
} from '../../components'

export function TeamDetailPage() {
  const { t } = useTranslation('team')
  const { projectId, teamId } = useParams<{ projectId: string; teamId: string }>()
  const teams = useAppStore(s => s.teams)
  const agents = useAppStore(s => s.agents)
  const updateTeam = useAppStore(s => s.updateTeam)
  const deleteTeam = useAppStore(s => s.deleteTeam)
  const navigate = useNavigate()

  const team = teams.find(t => t.id === teamId)
  const [activeTab, setActiveTab] = useState('general')
  const [saved, setSaved] = useState(false)

  const tabs = useMemo(() => [
    { id: 'general', label: t('detail.tabs.general') },
    { id: 'members', label: t('detail.tabs.members') },
  ], [t])

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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <PixelButton
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}/teams`)}
        >
          {t('detail.backBtn')}
        </PixelButton>
      </div>

      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="font-pixel text-[14px] text-text-primary">{team.name}</h1>
          <p className="text-[13px] text-text-secondary mt-1">{team.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-text-dim">
            <span>{t('list.members', { count: team.members.length })}</span>
          </div>
        </div>
      </div>

      <PixelTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === 'general' && (
          <GeneralTab team={team} updateTeam={updateTeam} deleteTeam={deleteTeam} navigate={navigate} projectId={projectId!} saved={saved} setSaved={setSaved} />
        )}
        {activeTab === 'members' && (
          <MembersTab team={team} agents={agents} updateTeam={updateTeam} saved={saved} setSaved={setSaved} />
        )}
      </div>
    </div>
  )
}

// --- General Tab ---
function GeneralTab({ team, updateTeam, deleteTeam, navigate, projectId, saved, setSaved }: {
  team: { id: string; name: string; description: string; instruction?: string }
  updateTeam: (id: any, data: any) => Promise<void>
  deleteTeam: (id: any) => Promise<void>
  navigate: (path: string) => void
  projectId: string
  saved: boolean
  setSaved: (v: boolean) => void
}) {
  const { t } = useTranslation('team')
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description)
  const [instruction, setInstruction] = useState(team.instruction ?? '')

  async function handleSave() {
    await updateTeam(team.id, { name: name.trim(), description: description.trim(), instruction: instruction.trim() || undefined })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDelete() {
    await deleteTeam(team.id)
    navigate(`/projects/${projectId}/teams`)
  }

  const isDirty = name !== team.name || description !== team.description || instruction !== (team.instruction ?? '')

  return (
    <PixelCard variant="outlined">
      <div className="flex flex-col gap-4">
        <h3 className="font-pixel text-[10px] text-text-secondary">{t('general.sectionTitle')}</h3>

        <PixelInput
          label="NAME"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <PixelInput
          label="DESCRIPTION"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />

        <PixelTextArea
          label={t('general.instructionLabel')}
          placeholder={t('general.instructionPlaceholder')}
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          rows={4}
        />

        <div className="flex items-center gap-2">
          <PixelButton variant="primary" disabled={!isDirty || !name.trim()} onClick={handleSave}>
            {t('common:button.save')}
          </PixelButton>
          {saved && <span className="text-accent-green text-[12px]">{t('detail.savedMsg')}</span>}
        </div>

        <div className="border-t-2 border-border-dim pt-4">
          <PixelButton variant="danger" onClick={handleDelete}>
            {t('detail.deleteBtn')}
          </PixelButton>
        </div>
      </div>
    </PixelCard>
  )
}

// --- Members Tab ---
function MembersTab({ team, agents, updateTeam, saved, setSaved }: {
  team: { id: string; members: TeamMember[] }
  agents: { id: AgentId; name: string }[]
  updateTeam: (id: any, data: any) => Promise<void>
  saved: boolean
  setSaved: (v: boolean) => void
}) {
  const { t } = useTranslation('team')
  const [members, setMembers] = useState<TeamMember[]>(team.members)
  const [addAgentId, setAddAgentId] = useState<string>('')

  // Agents not yet in the team
  const availableAgents = agents.filter(a => !members.some(m => m.agentId === a.id))

  async function handleSaveMembers() {
    await updateTeam(team.id, { members })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleAddMember() {
    if (!addAgentId) return
    const newMember: TeamMember = {
      agentId: addAgentId as AgentId,
      role: 'member',
      // First member = leader (no parentAgentId); subsequent members get leader as parent
      parentAgentId: members.length === 0 ? undefined : members.find(m => !m.parentAgentId)?.agentId,
    }
    setMembers([...members, newMember])
    setAddAgentId('')
  }

  function handleRemoveMember(agentId: AgentId) {
    setMembers(members.filter(m => m.agentId !== agentId))
  }

  function handleRoleChange(agentId: AgentId, role: string) {
    setMembers(members.map(m => m.agentId === agentId ? { ...m, role } : m))
  }

  const isDirty = JSON.stringify(members) !== JSON.stringify(team.members)

  return (
    <PixelCard variant="outlined">
      <div className="flex flex-col gap-4">
        <h3 className="font-pixel text-[10px] text-text-secondary">{t('members.sectionTitle')}</h3>

        {/* Current members */}
        {members.length === 0 ? (
          <p className="text-[12px] text-text-dim">{t('members.noneAssigned')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map(member => {
              const agent = agents.find(a => a.id === member.agentId)
              const isLeader = !member.parentAgentId
              return (
                <div key={member.agentId} className="flex items-center gap-3 p-2 bg-deep border-2 border-border-dim">
                  <span className="font-mono text-[12px] text-text-primary flex-1 min-w-0 truncate">
                    {agent?.name ?? member.agentId}
                  </span>
                  <span className="font-pixel text-[8px] text-accent-blue">
                    {isLeader ? t('members.leader') : t('members.member')}
                  </span>
                  <input
                    className="w-24 h-7 bg-void px-2 font-mono text-[11px] text-text-secondary border-2 border-border-dim outline-none focus:border-accent-blue"
                    placeholder={t('members.rolePlaceholder')}
                    value={member.role}
                    onChange={e => handleRoleChange(member.agentId, e.target.value)}
                  />
                  <PixelButton variant="ghost" size="sm" onClick={() => handleRemoveMember(member.agentId)}>
                    {t('members.removeBtn')}
                  </PixelButton>
                </div>
              )
            })}
          </div>
        )}

        {/* Add member */}
        <div>
          <h4 className="font-pixel text-[8px] text-text-secondary mb-2">{t('members.addSection')}</h4>
          {availableAgents.length === 0 ? (
            <p className="text-[12px] text-text-dim">{t('members.noneAvailable')}</p>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={addAgentId}
                onChange={e => setAddAgentId(e.target.value)}
                className="h-8 bg-deep px-2 font-mono text-[12px] text-text-primary border-2 border-border-dim outline-none focus:border-accent-blue flex-1 cursor-pointer"
              >
                <option value="">--</option>
                {availableAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <PixelButton variant="primary" size="sm" disabled={!addAgentId} onClick={handleAddMember}>
                {t('common:button.add')}
              </PixelButton>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-2 border-t-2 border-border-dim pt-4">
          <PixelButton variant="primary" disabled={!isDirty} onClick={handleSaveMembers}>
            {t('common:button.save')}
          </PixelButton>
          {saved && <span className="text-accent-green text-[12px]">{t('detail.savedMsg')}</span>}
        </div>
      </div>
    </PixelCard>
  )
}
