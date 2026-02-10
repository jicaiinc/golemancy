import type { Agent, AgentId } from '@solocraft/shared'
import { PixelCard, PixelAvatar } from '../../components'

interface Props {
  agents: Agent[]
  onStartChat: (agentId: AgentId) => void
}

export function ChatEmptyState({ agents, onStartChat }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center bg-void">
      <div className="text-center max-w-[400px]">
        {/* Pixel speech bubble art */}
        <div className="font-pixel text-[32px] text-text-dim mb-4 select-none">
          {'> _ <'}
        </div>
        <div className="relative inline-block mb-6">
          <div className="bg-surface border-2 border-border-dim px-4 py-3 shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.05)]">
            <p className="font-pixel text-[10px] text-text-secondary">Start a conversation</p>
          </div>
          {/* Speech bubble tail */}
          <div className="absolute -bottom-2 left-6 w-3 h-2 bg-surface border-b-2 border-r-2 border-border-dim" />
        </div>

        <p className="text-[12px] text-text-dim mb-6">
          Select a conversation from the sidebar or start a new one with an agent.
        </p>

        {agents.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-pixel text-[8px] text-text-dim">QUICK START</span>
            {agents.slice(0, 3).map(agent => (
              <PixelCard
                key={agent.id}
                variant="interactive"
                className="flex items-center gap-3 text-left"
                onClick={() => onStartChat(agent.id)}
              >
                <PixelAvatar size="sm" initials={agent.name} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-text-primary">{agent.name}</div>
                  <div className="text-[11px] text-text-dim truncate">{agent.description}</div>
                </div>
                <span className="text-accent-green text-[11px]">&gt;</span>
              </PixelCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
