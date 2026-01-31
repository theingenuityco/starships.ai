/**
 * Types and helpers for in-conversation search (Discord-style sidebar).
 */

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
