import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'

export const NODE_WIDTH = 200
export const NODE_HEIGHT = 120

const ISOLATED_X_OFFSET = 600
const ISOLATED_Y_SPACING = 160

/**
 * Apply dagre auto-layout for team topology:
 * - Connected nodes (part of tree) laid out with dagre TB
 * - Isolated nodes stacked vertically on the right
 * - Nodes with saved positions retain those positions
 */
export function computeTeamLayout<T extends Record<string, unknown>, E extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge<E>[],
  savedLayout: Record<string, { x: number; y: number }>,
): Node<T>[] {
  const connectedNodeIds = new Set<string>()
  for (const edge of edges) {
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  }

  const connectedNodes = nodes.filter(n => connectedNodeIds.has(n.id))
  const isolatedNodes = nodes.filter(n => !connectedNodeIds.has(n.id))

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 })

  for (const node of connectedNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  if (connectedNodes.length > 0) {
    dagre.layout(g)
  }

  const layoutedNodes: Node<T>[] = []

  for (const node of connectedNodes) {
    if (savedLayout[node.id]) {
      layoutedNodes.push({ ...node, position: savedLayout[node.id] })
    } else {
      const dagreNode = g.node(node.id)
      layoutedNodes.push({
        ...node,
        position: {
          x: dagreNode.x - NODE_WIDTH / 2,
          y: dagreNode.y - NODE_HEIGHT / 2,
        },
      })
    }
  }

  for (let i = 0; i < isolatedNodes.length; i++) {
    const node = isolatedNodes[i]
    if (savedLayout[node.id]) {
      layoutedNodes.push({ ...node, position: savedLayout[node.id] })
    } else {
      layoutedNodes.push({
        ...node,
        position: {
          x: ISOLATED_X_OFFSET,
          y: i * ISOLATED_Y_SPACING,
        },
      })
    }
  }

  return layoutedNodes
}
