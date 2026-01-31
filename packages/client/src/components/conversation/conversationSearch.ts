/**
 * Types and helpers for in-conversation search (Discord-style sidebar).
 */

/**
 * Strip markdown to plain text so snippets match how users see content in chat.
 * Process the full string so we never show partial formatting (e.g. "**" at snippet edges).
 */
export function stripMarkdownToPlainText(text: string): string {
  if (!text || typeof text !== 'string') return ''
  let out = text
  // Remove bold/strong first: ** and __ (all occurrences so "t**hi**rd" -> "third")
  out = out.replace(/\*\*/g, '').replace(/__/g, '')
  // Inline code `code`
  out = out.replace(/`([^`]+)`/g, '$1')
  // Strikethrough ~~text~~
  out = out.replace(/~~([^~]*?)~~/g, '$1')
  // Italic *text* or _text_ (delimiters only when they wrap content)
  out = out.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1')
  return out.trim()
}

/**
 * Plain-text snippet for a message: strip first, then slice. Ensures the snippet
 * never contains raw markdown (e.g. "**") from boundary cuts.
 */
export function buildPlainTextSnippet(fullText: string, query: string, snippetRadius = 50): string {
  const plain = stripMarkdownToPlainText(fullText)
  const q = query.trim().toLowerCase()
  if (!q) return plain.slice(0, 120)
  const idx = plain.toLowerCase().indexOf(q)
  if (idx === -1) return plain.slice(0, 120)
  const start = Math.max(0, idx - snippetRadius)
  const end = Math.min(plain.length, idx + q.length + snippetRadius)
  return plain.slice(start, end).trim()
}

export interface SearchResult {
  messageId: string
  role: 'user' | 'assistant' | string
  contentSnippet: string
  timestamp?: string
  occurrenceCount: number
  /** Index into the flat occurrence list (matchingPositions) for scrolling. */
  firstMatchIndexInPositions: number
  /** Assistant display name when role is assistant. */
  agentName?: string
}
