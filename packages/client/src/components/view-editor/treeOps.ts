import type { WidgetInstanceNode } from '@starships/protocol'

const MAX_DEPTH = 32
const MAX_NODES = 2000

function clampIndex(index: number, len: number): number {
  const i = Math.floor(Number(index) || 0)
  if (i < 0) return 0
  if (i > len) return len
  return i
}

export function findNode(root: WidgetInstanceNode, id: string): WidgetInstanceNode | null {
  if (!root || !id) return null
  if (String(root.id) === String(id)) return root
  const children = Array.isArray(root.children) ? root.children : []
  for (const c of children) {
    const found = findNode(c, id)
    if (found) return found
  }
  return null
}

export function updateNode(root: WidgetInstanceNode, id: string, updater: (n: WidgetInstanceNode) => WidgetInstanceNode): WidgetInstanceNode {
  if (String(root.id) === String(id)) return updater(root)
  const children = Array.isArray(root.children) ? root.children : []
  if (!children.length) return root
  return {
    ...root,
    children: children.map(c => updateNode(c, id, updater)),
  }
}

export function removeNode(root: WidgetInstanceNode, id: string): WidgetInstanceNode {
  const children = Array.isArray(root.children) ? root.children : []
  const nextChildren = children
    .filter(c => String(c.id) !== String(id))
    .map(c => removeNode(c, id))
  return { ...root, ...(children.length ? { children: nextChildren } : null) }
}

export function getParentId(root: WidgetInstanceNode, id: string): string | null {
  if (!root || !id) return null
  const children = Array.isArray(root.children) ? root.children : []
  for (const c of children) {
    if (String(c.id) === String(id)) return String(root.id)
    const nested = getParentId(c, id)
    if (nested) return nested
  }
  return null
}

export function isDescendant(root: WidgetInstanceNode, nodeId: string, possibleAncestorId: string): boolean {
  const ancestor = findNode(root, possibleAncestorId)
  if (!ancestor) return false
  return Boolean(findNode(ancestor, nodeId))
}

export function countNodes(root: WidgetInstanceNode): number {
  let n = 0
  const stack: WidgetInstanceNode[] = [root]
  while (stack.length) {
    const cur = stack.pop()!
    n++
    const children = Array.isArray(cur.children) ? cur.children : []
    for (const c of children) stack.push(c)
  }
  return n
}

export function maxDepth(root: WidgetInstanceNode): number {
  let max = 1
  const stack: Array<{ node: WidgetInstanceNode; depth: number }> = [{ node: root, depth: 1 }]
  while (stack.length) {
    const { node, depth } = stack.pop()!
    if (depth > max) max = depth
    const children = Array.isArray(node.children) ? node.children : []
    for (const c of children) stack.push({ node: c, depth: depth + 1 })
  }
  return max
}

function withinLimits(root: WidgetInstanceNode): boolean {
  return countNodes(root) <= MAX_NODES && maxDepth(root) <= MAX_DEPTH
}

export function insertChild(root: WidgetInstanceNode, parentId: string, index: number, child: WidgetInstanceNode): WidgetInstanceNode {
  const parent = findNode(root, parentId)
  if (!parent) return root

  const next = updateNode(root, parentId, (n) => {
    const children = Array.isArray(n.children) ? n.children : []
    const i = clampIndex(index, children.length)
    const nextChildren = [...children.slice(0, i), child, ...children.slice(i)]
    return { ...n, children: nextChildren }
  })

  return withinLimits(next) ? next : root
}

function extractNode(root: WidgetInstanceNode, nodeId: string): { node: WidgetInstanceNode | null; rest: WidgetInstanceNode } {
  let extracted: WidgetInstanceNode | null = null

  function walk(n: WidgetInstanceNode): WidgetInstanceNode {
    const children = Array.isArray(n.children) ? n.children : []
    const nextChildren: WidgetInstanceNode[] = []
    for (const c of children) {
      if (String(c.id) === String(nodeId)) {
        extracted = c
        continue
      }
      nextChildren.push(walk(c))
    }
    return { ...n, ...(children.length ? { children: nextChildren } : null) }
  }

  const rest = walk(root)
  return { node: extracted, rest }
}

export function moveNode(root: WidgetInstanceNode, nodeId: string, toParentId: string, toIndex: number): WidgetInstanceNode {
  if (!root || !nodeId || !toParentId) return root
  if (String(nodeId) === String(toParentId)) return root

  // Disallow moving a node into its own subtree.
  if (isDescendant(root, toParentId, nodeId)) return root

  const { node, rest } = extractNode(root, nodeId)
  if (!node) return root

  const parent = findNode(rest, toParentId)
  if (!parent) return root

  const next = insertChild(rest, toParentId, toIndex, node)
  return withinLimits(next) ? next : root
}

export function reorderChild(root: WidgetInstanceNode, parentId: string, fromIndex: number, toIndex: number): WidgetInstanceNode {
  if (!root || !parentId) return root

  const parent = findNode(root, parentId)
  if (!parent) return root
  const children = Array.isArray(parent.children) ? parent.children : []
  if (!children.length) return root

  const from = clampIndex(fromIndex, children.length - 1)
  const to = clampIndex(toIndex, children.length - 1)
  if (from === to) return root

  const next = updateNode(root, parentId, (n) => {
    const arr = Array.isArray(n.children) ? [...n.children] : []
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    return { ...n, children: arr }
  })

  return withinLimits(next) ? next : root
}

export function getChildIndex(root: WidgetInstanceNode, parentId: string, childId: string): number {
  const parent = findNode(root, parentId)
  if (!parent) return -1
  const children = Array.isArray(parent.children) ? parent.children : []
  return children.findIndex(c => String(c.id) === String(childId))
}

