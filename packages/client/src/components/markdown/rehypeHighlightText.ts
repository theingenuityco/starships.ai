'use client'

/**
 * Rehype plugin that wraps every occurrence of a search term (case-insensitive) in <mark>.
 * Ensures in-chat search highlights are visible in all markdown content (lists, bold, etc.).
 */

interface HastText {
  type: 'text'
  value: string
}

interface HastElement {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children: HastNode[]
}

type HastNode = HastText | HastElement

interface HastRoot {
  type: 'root'
  children: HastNode[]
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function rehypeHighlightText(options: { highlightTerm?: string }) {
  const term = options?.highlightTerm?.trim()
  if (!term) return () => {}

  const escaped = escapeRegex(term)
  const regex = new RegExp(`(${escaped})`, 'gi')
  const termLower = term.toLowerCase()

  return (tree: HastRoot) => {
    if (!tree || typeof tree !== 'object' || !Array.isArray((tree as { children?: unknown }).children)) return
    visit(tree as HastRoot, (node, index, parent) => {
      if (!node || typeof node !== 'object' || node.type !== 'text' || !parent || typeof index !== 'number') return
      const value = (node as HastText).value
      if (typeof value !== 'string') return
      const parts = value.split(regex)
      if (parts.length <= 1) return
      const newNodes: HastNode[] = parts.map(part => {
        if (part.toLowerCase() === termLower) {
          return {
            type: 'element',
            tagName: 'mark',
            properties: {
              className: ['bg-amber-200/70', 'dark:bg-amber-400/50', 'rounded', 'px-0.5', 'font-medium'],
            },
            children: [{ type: 'text', value: part }],
          }
        }
        return { type: 'text', value: part }
      })
      parent.children.splice(index, 1, ...newNodes)
    })
  }
}

function visit(
  node: HastRoot | HastElement | HastText | null | undefined,
  fn: (node: HastNode, index: number, parent: { children: HastNode[] }) => void
): void {
  if (!node || typeof node !== 'object' || !('type' in node)) return
  if (node.type === 'text') return
  const children = (node as HastRoot | HastElement).children
  if (!Array.isArray(children)) return
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]
    if (!child || typeof child !== 'object') continue
    fn(child, i, node as { children: HastNode[] })
    if (child.type !== 'text') {
      visit(child, fn)
    }
  }
}
