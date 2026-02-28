import { PixelCard, PixelInput, PixelTextArea } from '../../../components'

const ICONS = [
  { id: 'pickaxe', label: '\u26CF' },
  { id: 'sword', label: '\u2694' },
  { id: 'shield', label: '\uD83D\uDEE1' },
  { id: 'book', label: '\uD83D\uDCD6' },
  { id: 'star', label: '\u2B50' },
  { id: 'gem', label: '\uD83D\uDC8E' },
  { id: 'flame', label: '\uD83D\uDD25' },
  { id: 'bolt', label: '\u26A1' },
]

interface ProjectStepProps {
  projectName: string
  projectDescription: string
  projectIcon: string
  onUpdate: (data: {
    projectName?: string
    projectDescription?: string
    projectIcon?: string
  }) => void
}

export function ProjectStep({
  projectName,
  projectDescription,
  projectIcon,
  onUpdate,
}: ProjectStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="font-pixel text-[14px] text-text-primary mb-2">Create Your First Project</h2>
        <p className="font-mono text-[11px] text-text-dim">Projects organize your agents, conversations, and workflows.</p>
      </div>

      <PixelCard>
        <div className="flex flex-col gap-4">
          <PixelInput
            label="PROJECT NAME"
            value={projectName}
            onChange={e => onUpdate({ projectName: e.target.value })}
            placeholder="My Awesome Project"
          />

          <PixelTextArea
            label="DESCRIPTION"
            value={projectDescription}
            onChange={e => onUpdate({ projectDescription: e.target.value })}
            placeholder="What will this project do?"
          />

          {/* Icon picker */}
          <div className="flex flex-col gap-1">
            <label className="font-pixel text-[8px] leading-[12px] text-text-secondary">
              ICON
            </label>
            <div className="flex gap-2">
              {ICONS.map(ic => (
                <button
                  key={ic.id}
                  onClick={() => onUpdate({ projectIcon: ic.id })}
                  className={`w-10 h-10 flex items-center justify-center text-[18px] border-2 cursor-pointer transition-colors ${
                    projectIcon === ic.id
                      ? 'bg-accent-green/15 border-accent-green'
                      : 'bg-deep border-border-dim hover:border-border-bright'
                  }`}
                >
                  {ic.label}
                </button>
              ))}
            </div>
          </div>

          {/* Coming soon placeholder */}
          <div className="mt-2 pt-3 border-t-2 border-border-dim">
            <div className="flex items-center gap-2">
              <span className="font-pixel text-[9px] text-text-dim">FROM TEMPLATE</span>
              <span className="text-[9px] text-accent-amber font-mono">Coming Soon</span>
            </div>
          </div>
        </div>
      </PixelCard>
    </div>
  )
}
