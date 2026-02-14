import type { SandboxPreset } from '@golemancy/shared'
import { PRESET_METADATA } from '@golemancy/shared'

const PRESET_ICONS: Record<string, string> = {
  balanced: '\u2696',
  strict: '\uD83D\uDD12',
  permissive: '\uD83D\uDD13',
  development: '\u26A1',
  custom: '\u2699',
}

const PRESET_DESCRIPTIONS: Record<SandboxPreset, string> = {
  balanced: 'Allows workspace and cache writes, blocks sensitive files (~/.ssh, .env), permits major package registries.',
  strict: 'Read-only workspace (except /tmp), no network access, no Python execution. Maximum isolation.',
  permissive: 'Broader filesystem access, more network domains. For projects that need extra flexibility.',
  development: 'Full network access, broad filesystem permissions. Only hard-banned operations are blocked.',
  custom: 'Configure your own filesystem, network, and command rules below.',
}

interface BashPresetSelectorProps {
  value: SandboxPreset
  onChange: (preset: SandboxPreset) => void
}

export function BashPresetSelector({ value, onChange }: BashPresetSelectorProps) {
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {PRESET_METADATA.map(preset => {
          const isSelected = value === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.id)}
              className={`p-3 border-2 cursor-pointer transition-colors text-center ${
                isSelected
                  ? 'bg-elevated border-accent-green'
                  : 'bg-deep border-border-dim hover:border-border-bright'
              }`}
            >
              <div className="text-[16px] mb-1">{PRESET_ICONS[preset.id] ?? '\u2699'}</div>
              <div className="text-[11px] text-text-primary">{preset.name}</div>
              <div className="text-[9px] text-text-dim mt-0.5">{preset.subtitle}</div>
              {isSelected && <div className="text-[9px] text-accent-green mt-1">Active</div>}
            </button>
          )
        })}
      </div>
      <div className="text-[11px] text-text-dim mt-2">
        {PRESET_DESCRIPTIONS[value]}
      </div>
    </div>
  )
}
