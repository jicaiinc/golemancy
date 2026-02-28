import { PixelCard } from '../../../components'

const FEATURES = [
  { icon: '\u2694', title: 'Orchestrate Agents', desc: 'Build teams of AI agents that work together on complex tasks.' },
  { icon: '\u26A1', title: 'Multi-Provider', desc: 'Connect to Anthropic, OpenAI, Google, and more with a single config.' },
  { icon: '\u2699', title: 'Automate Workflows', desc: 'Schedule cron jobs, chain skills, and let agents run autonomously.' },
]

export function WelcomeStep() {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="font-pixel text-[20px] text-text-primary mb-3">Welcome to Golemancy</h1>
        <p className="font-mono text-[14px] text-text-secondary">Command Your AI Golems</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
        {FEATURES.map(f => (
          <PixelCard key={f.title} className="text-center !py-6">
            <div className="text-[28px] mb-3">{f.icon}</div>
            <div className="font-pixel text-[10px] text-text-primary mb-2">{f.title}</div>
            <p className="font-mono text-[11px] text-text-dim leading-relaxed">{f.desc}</p>
          </PixelCard>
        ))}
      </div>
    </div>
  )
}
