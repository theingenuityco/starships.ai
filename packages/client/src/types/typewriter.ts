/**
 * Typewriter Effect Types
 *
 * Client-side types for character-by-character text display functionality.
 * Socket.IO streaming functionality has been removed.
 */

/**
 * Typewriter chunk for character-by-character display
 */
export interface TypewriterChunk {
  type: 'character' | 'word' | 'line' | 'complete'
  content: string
  position: number
  totalLength?: number
  delay?: number // milliseconds
  isCode?: boolean
  isMarkdown?: boolean
}
