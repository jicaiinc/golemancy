import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import { computeTeamLayout, NODE_WIDTH, NODE_HEIGHT } from './useTeamTopologyLayout'

function makeNode(id: string, position = { x: 0, y: 0 }): Node {
  return { id, type: 'teamNode', position, data: {} }
}

function makeEdge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target }
}

describe('computeTeamLayout', () => {
  it('returns empty array for no nodes', () => {
    const result = computeTeamLayout([], [], {})
    expect(result).toEqual([])
  })

  it('lays out a single isolated node', () => {
    const nodes = [makeNode('a')]
    const result = computeTeamLayout(nodes, [], {})
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
    expect(result[0].position.x).toBe(600) // ISOLATED_X_OFFSET
    expect(result[0].position.y).toBe(0)
  })

  it('places multiple isolated nodes vertically', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
    const result = computeTeamLayout(nodes, [], {})
    expect(result).toHaveLength(3)
    expect(result[0].position.y).toBe(0)
    expect(result[1].position.y).toBe(160) // ISOLATED_Y_SPACING
    expect(result[2].position.y).toBe(320)
  })

  it('uses dagre for connected nodes', () => {
    const nodes = [makeNode('leader'), makeNode('child')]
    const edges = [makeEdge('leader', 'child')]
    const result = computeTeamLayout(nodes, edges, {})

    expect(result).toHaveLength(2)
    const leader = result.find(n => n.id === 'leader')!
    const child = result.find(n => n.id === 'child')!
    // Child should be below leader
    expect(child.position.y).toBeGreaterThan(leader.position.y)
  })

  it('preserves saved positions for known nodes', () => {
    const nodes = [makeNode('a'), makeNode('b')]
    const edges = [makeEdge('a', 'b')]
    const saved = { a: { x: 100, y: 200 } }
    const result = computeTeamLayout(nodes, edges, saved)

    const nodeA = result.find(n => n.id === 'a')!
    expect(nodeA.position).toEqual({ x: 100, y: 200 })
    // Node b should get dagre layout (different from default 0,0 input)
    const nodeB = result.find(n => n.id === 'b')!
    // dagre assigns a position — just ensure it's a valid number
    expect(typeof nodeB.position.x).toBe('number')
    expect(typeof nodeB.position.y).toBe('number')
  })

  it('handles mixed connected and isolated nodes', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
    const edges = [makeEdge('a', 'b')]
    const result = computeTeamLayout(nodes, edges, {})

    expect(result).toHaveLength(3)
    const isolated = result.find(n => n.id === 'c')!
    // Isolated node should be at ISOLATED_X_OFFSET
    expect(isolated.position.x).toBe(600)
  })

  it('uses saved positions for isolated nodes', () => {
    const nodes = [makeNode('a')]
    const saved = { a: { x: 42, y: 99 } }
    const result = computeTeamLayout(nodes, [], saved)
    expect(result[0].position).toEqual({ x: 42, y: 99 })
  })

  it('exports correct constants', () => {
    expect(NODE_WIDTH).toBe(200)
    expect(NODE_HEIGHT).toBe(120)
  })
})
