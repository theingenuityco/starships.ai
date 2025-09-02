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
  totalLength?: number;
  delay?: number; // milliseconds
  isCode?: boolean;
  isMarkdown?: boolean;
}

// Import unified types from protocol
import type { SessionStreamChunk } from '@starships/protocol';

export type AgentSocketStreamChunk = SessionStreamChunk & {
  source: 'agent';
  agentId: string;
  typewriter?: TypewriterChunk;
};

// Re-export for external use
export type { SessionStreamChunk };