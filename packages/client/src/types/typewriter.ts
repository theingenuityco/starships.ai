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
import type { ChatSocketStreamChunk } from '@starships/protocol';

// Legacy type aliases for backward compatibility in client code
export type SibilSocketStreamChunk = ChatSocketStreamChunk & {
  source: 'sibil';
  typewriter?: TypewriterChunk;
};

export type AgentSocketStreamChunk = ChatSocketStreamChunk & {
  source: 'agent';
  agent_id: string;
  typewriter?: TypewriterChunk;
};

// Re-export for external use
export type { ChatSocketStreamChunk };