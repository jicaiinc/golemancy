import type { AgentModelConfig } from '@golemancy/shared'
import { PixelCard, PixelButton } from '../../../components'

interface CompleteStepProps {
  providerName: string
  defaultModel: AgentModelConfig | null
  sttEnabled: boolean
  projectName: string
  projectIcon: string
  onStartChatting: () => void
  onGoToDashboard: () => void
}

const ICON_MAP: Record<string, string> = {
  pickaxe: '\u26CF',
  sword: '\u2694',
  shield: '\uD83D\uDEE1',
  book: '\uD83D\uDCD6',
  star: '\u2B50',
  gem: '\uD83D\uDC8E',
  flame: '\uD83D\uDD25',
  bolt: '\u26A1',
}

export function CompleteStep({
  providerName,
  defaultModel,
  sttEnabled,
  projectName,
  projectIcon,
  onStartChatting,
  onGoToDashboard,
}: CompleteStepProps) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <h2 className="font-pixel text-[18px] text-accent-green mb-3">You're All Set!</h2>
        <p className="font-mono text-[12px] text-text-secondary">Here's a summary of your configuration.</p>
      </div>

      {/* Summary */}
      <PixelCard className="w-full">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[9px] text-text-dim">PROVIDER</span>
            <span className="font-mono text-[12px] text-accent-green">{providerName}</span>
          </div>
          {defaultModel && (
            <div className="flex items-center justify-between">
              <span className="font-pixel text-[9px] text-text-dim">DEFAULT MODEL</span>
              <span className="font-mono text-[12px] text-text-primary">{defaultModel.model}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[9px] text-text-dim">SPEECH-TO-TEXT</span>
            <span className={`font-mono text-[12px] ${sttEnabled ? 'text-accent-green' : 'text-text-dim'}`}>
              {sttEnabled ? 'Enabled' : 'Skipped'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[9px] text-text-dim">PROJECT</span>
            <span className="font-mono text-[12px] text-text-primary">
              {ICON_MAP[projectIcon] ?? '\u26CF'} {projectName}
            </span>
          </div>
        </div>
      </PixelCard>

      {/* CTAs */}
      <div className="flex gap-3">
        <PixelButton variant="primary" size="lg" onClick={onStartChatting}>
          Start Chatting
        </PixelButton>
        <PixelButton variant="secondary" size="lg" onClick={onGoToDashboard}>
          Go to Dashboard
        </PixelButton>
      </div>

      {/* Quick links */}
      <div className="flex gap-4 text-[10px]">
        <a href="#/settings" className="text-accent-blue hover:text-text-primary transition-colors">Settings</a>
        <a href="https://discord.gg/xksGkxd6SV" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:text-text-primary transition-colors">Discord</a>
        <a href="https://golemancy.ai" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:text-text-primary transition-colors">Documentation</a>
      </div>
    </div>
  )
}
