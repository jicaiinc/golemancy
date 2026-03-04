import { describe, it, expect } from 'vitest'
import type { AgentId, TeamMember } from '@golemancy/shared'
import { isDescendantOf } from './useTeamTopologyData'

function member(agentId: string, parentAgentId?: string): TeamMember {
  return { agentId: agentId as AgentId, role: '', parentAgentId: parentAgentId as AgentId | undefined }
}

describe('isDescendantOf', () => {
  const members: TeamMember[] = [
    member('leader'),                    // root (no parent)
    member('child1', 'leader'),          // leader -> child1
    member('child2', 'leader'),          // leader -> child2
    member('grandchild1', 'child1'),     // child1 -> grandchild1
    member('greatgrandchild', 'grandchild1'), // grandchild1 -> greatgrandchild
  ]

  it('returns true for direct child', () => {
    expect(isDescendantOf('child1' as AgentId, 'leader' as AgentId, members)).toBe(true)
  })

  it('returns true for grandchild', () => {
    expect(isDescendantOf('grandchild1' as AgentId, 'leader' as AgentId, members)).toBe(true)
  })

  it('returns true for great-grandchild', () => {
    expect(isDescendantOf('greatgrandchild' as AgentId, 'leader' as AgentId, members)).toBe(true)
  })

  it('returns false for ancestor (reverse direction)', () => {
    expect(isDescendantOf('leader' as AgentId, 'child1' as AgentId, members)).toBe(false)
  })

  it('returns false for siblings', () => {
    expect(isDescendantOf('child1' as AgentId, 'child2' as AgentId, members)).toBe(false)
  })

  it('returns false for self', () => {
    expect(isDescendantOf('child1' as AgentId, 'child1' as AgentId, members)).toBe(false)
  })

  it('returns false for unrelated (root has no parent)', () => {
    expect(isDescendantOf('leader' as AgentId, 'nonexistent' as AgentId, members)).toBe(false)
  })

  it('handles empty members', () => {
    expect(isDescendantOf('a' as AgentId, 'b' as AgentId, [])).toBe(false)
  })

  it('handles circular references without infinite loop', () => {
    const circular: TeamMember[] = [
      member('a', 'b'),
      member('b', 'a'),
    ]
    expect(isDescendantOf('a' as AgentId, 'c' as AgentId, circular)).toBe(false)
  })
})
