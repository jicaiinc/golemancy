import os from 'node:os'
import type { PermissionMode } from '@golemancy/shared'

export interface EnvironmentInfoOptions {
  agentName: string
  workspaceDir?: string
  platform: string
  permissionMode?: PermissionMode
  model?: string
  provider?: string
}

function getLocalDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function buildEnvironmentInstructions(opts: EnvironmentInfoOptions): string {
  const lines: string[] = []
  lines.push('## Environment')
  lines.push('')
  lines.push(`- Agent: ${opts.agentName}`)
  if (opts.workspaceDir) {
    lines.push(`- Workspace: ${opts.workspaceDir}`)
  }
  lines.push(`- Platform: ${opts.platform}`)
  lines.push(`- OS: ${os.type()} ${os.release()}`)
  if (opts.model) {
    const modelDisplay = opts.provider ? `${opts.model} (${opts.provider})` : opts.model
    lines.push(`- Model: ${modelDisplay}`)
  }
  lines.push(`- Date: ${getLocalDate()}`)
  if (opts.permissionMode) {
    lines.push(`- Permission mode: ${opts.permissionMode}`)
  }

  if (opts.permissionMode === 'unrestricted') {
    lines.push('')
    lines.push('Exercise caution with destructive or hard-to-reverse operations (deleting files, overwriting data, sending messages to external services). State what you are about to do before proceeding with such operations.')
  } else if (opts.permissionMode === 'sandbox') {
    lines.push('')
    lines.push('Filesystem and network access are governed by the project\'s permissions config.')
  } else if (opts.permissionMode === 'restricted') {
    lines.push('')
    lines.push('You are running in a sandboxed environment. All operations are confined to the sandbox — execute freely.')
  }

  return lines.join('\n')
}
