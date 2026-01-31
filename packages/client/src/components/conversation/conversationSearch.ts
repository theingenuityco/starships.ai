/**
 * Types and helpers for in-conversation search (Discord-style sidebar).
 */

/**
 * Strip common markdown formatting to plain text so snippets display like chat (no **, *, etc.).
 */
export function stripMarkdownToPlainText(text: string): string {
  if (!text || typeof text !== 'string') return ''
  let out = text
  // Bold **text** or __text__
  out = out.replace(/\*\*([^*]*)\*\*/g, '$1').replace(/__([^_]*?)__/g, '$1')
  // Inline code `code`
  out = out.replace(/`([^`]+)`/g, '$1')
  // Strikethrough ~~text~~
  out = out.replace(/~~([^~]*?)~~/g, '$1')
  // Leftover single * or _ (e.g. *italic* or _italic_) — remove the delimiters only when they wrap a word
  out = out.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1')
  return out.trim()
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
