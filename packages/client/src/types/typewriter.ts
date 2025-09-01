/**
 * Typewriter Effect Types
 * 
 * Client-side types for character-by-character text display functionality.
 */

/**
 * Typewriter chunk for character-by-character display
 */
export interface TypewriterChunk {
  type: 'character' | 'word' | 'line' | 'complete';
  content: string;
  position: number;
  total_length?: number;
  delay?: number; // milliseconds
  is_code?: boolean;
  is_markdown?: boolean;
}

// Import unified types from protocol
import type { ChatStreamChunk } from '@starships/protocol';

export type AgentSocketStreamChunk = ChatStreamChunk & {
  source: 'agent';
  agent_id: string;
  typewriter?: TypewriterChunk;
};

// Re-export for external use
export type { ChatStreamChunk };