import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'

const NODE_WIDTH = 240
const NODE_HEIGHT = 100
const ISOLATED_X_OFFSET = 800 // X position for isolated nodes column
const ISOLATED_Y_SPACING = 140 // Vertical spacing between isolated nodes

/**
 * Apply dagre auto-layout with custom positioning:
 * - Connected nodes (part of tree) are laid out on the left using dagre
 * - Isolated nodes (no connections) are stacked vertically on the right
 * - Nodes with existing positions in `savedLayout` retain those positions
 */
export function computeDagreLayout<T extends Record<string, unknown>, E extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge<E>[],
  savedLayout: Record<string, { x: number; y: number }>,
): Node<T>[] {
  // Separate connected and isolated nodes
  const connectedNodeIds = new Set<string>()
  for (const edge of edges) {
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  }

  const connectedNodes = nodes.filter(n => connectedNodeIds.has(n.id))
  const isolatedNodes = nodes.filter(n => !connectedNodeIds.has(n.id))

  // Layout connected nodes using dagre on the left
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

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

  // Position connected nodes (left side)
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

  // Position isolated nodes (right side, stacked vertically)
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
