import os from 'node:os'
import type { PermissionMode } from '@golemancy/shared'

export interface EnvironmentInfoOptions {
  agentName: string
  projectId?: string
  workspaceDir?: string
  platform: string
  permissionMode?: PermissionMode
  model?: string
  provider?: string
  /** When true, suppress "wait for confirmation" guidance (cron jobs, automated pipelines). */
  isAutomated?: boolean
}

function getLocalDateTime(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return `${y}-${m}-${d} ${h}:${min} (${tz})`
}

export function buildEnvironmentInstructions(opts: EnvironmentInfoOptions): string {
  const lines: string[] = []
  lines.push('# System')
  lines.push('')
  if (opts.projectId) {
    lines.push(`- Project: ${opts.projectId}`)
  }
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
  lines.push(`- Date: ${getLocalDateTime()}`)
  if (opts.permissionMode) {
    lines.push(`- Permission mode: ${opts.permissionMode}`)
  }

  if (opts.permissionMode === 'unrestricted') {
    lines.push('')
    lines.push('CAUTION: You are running in unrestricted mode — no sandbox or permission guardrails are active.')
    if (opts.isAutomated) {
      lines.push('Log what you are doing before destructive operations (deleting files, overwriting data, modifying system configs), then proceed.')
    } else {
      lines.push('Before any destructive or hard-to-reverse operation, state what you intend to do and wait for confirmation.')
      lines.push('This includes: deleting files, overwriting data, modifying system configs.')
    }
  } else if (opts.permissionMode === 'sandbox') {
    lines.push('')
    lines.push('Filesystem and network access are governed by the project\'s permissions config.')
  } else if (opts.permissionMode === 'restricted') {
    lines.push('')
    lines.push('You are running in a sandboxed environment. All operations are confined to the sandbox — execute freely.')
  }

  return lines.join('\n')
}
