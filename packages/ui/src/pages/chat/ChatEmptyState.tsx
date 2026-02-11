import { useParams } from 'react-router'
import type { AgentId } from '@solocraft/shared'
import { PixelCard, PixelButton } from '../../components'

interface Props {
  mainAgentId?: AgentId
  onNewChat: () => void
  canNewChat: boolean
}

export function ChatEmptyState({ mainAgentId, onNewChat, canNewChat }: Props) {
  const { projectId } = useParams<{ projectId: string }>()

  // State 1: Main Agent configured — show welcome + start CTA
  if (mainAgentId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-void">
        <div className="text-center max-w-[400px]">
          <div className="font-pixel text-[32px] text-text-dim mb-4 select-none">
            {'> _ <'}
          </div>
          <div className="relative inline-block mb-6">
            <div className="bg-surface border-2 border-border-dim px-4 py-3 shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.05)]">
              <p className="font-pixel text-[10px] text-text-secondary">
                Ready to chat
              </p>
            </div>
            <div className="absolute -bottom-2 left-6 w-3 h-2 bg-surface border-b-2 border-r-2 border-border-dim" />
          </div>

          <p className="text-[12px] text-text-dim mb-6">
            Start a new conversation or select one from the sidebar.
          </p>

          <PixelButton variant="primary" onClick={onNewChat} disabled={!canNewChat}>
            Start Chatting
          </PixelButton>
        </div>
      </div>
    )
  }

  // State 2: No Main Agent — guide to Settings
  return (
    <div className="flex-1 flex items-center justify-center bg-void">
      <div className="text-center max-w-[400px]">
        <div className="font-pixel text-[32px] text-text-dim mb-4 select-none">
          {'> _ <'}
        </div>
        <div className="relative inline-block mb-6">
          <div className="bg-surface border-2 border-border-dim px-4 py-3 shadow-[inset_2px_2px_0_0_rgba(255,255,255,0.05)]">
            <p className="font-pixel text-[10px] text-text-secondary">No Main Agent</p>
          </div>
          <div className="absolute -bottom-2 left-6 w-3 h-2 bg-surface border-b-2 border-r-2 border-border-dim" />
        </div>

        <PixelCard variant="outlined" className="mb-6 text-left">
          <p className="text-[12px] text-text-dim">
            Configure a Main Agent in{' '}
            <a
              href={`#/projects/${projectId}/settings`}
              className="text-accent-blue hover:underline"
            >
              Project Settings
            </a>
            {' '}to start chatting.
          </p>
        </PixelCard>
      </div>
    </div>
  )
}
