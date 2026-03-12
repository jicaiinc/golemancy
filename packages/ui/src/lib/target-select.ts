import type { AgentId, TargetRef, TeamId } from '@golemancy/shared'

export function encodeTargetValue(target: TargetRef): string {
  return `${target.kind}:${target.id}`
}

export function decodeTargetValue(value: string): TargetRef | null {
  if (!value) return null
  const [kind, id] = value.split(':', 2)
  if (kind === 'agent') {
    return { kind, id: id as AgentId }
  }
  if (kind === 'team') {
    return { kind, id: id as TeamId }
  }
  return null
}
