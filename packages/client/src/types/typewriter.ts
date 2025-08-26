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

/**
 * Enhanced streaming chunk with typewriter support
 */
export interface SibilSocketStreamChunk {
  stream_id: string;
  type: 'content' | 'structured' | 'complete' | 'error' | 'connected';
  content?: string;
  structured_content?: any[];
  provider?: 'openai' | 'anthropic';
  model?: string;
  usage?: any;
  error?: string;
  chunk_id?: string;
  is_final?: boolean;
  typewriter?: TypewriterChunk;
  typing_speed?: number;
  timestamp: number;
}

/**
 * Agent streaming chunk with typewriter support
 */
export interface AgentSocketStreamChunk {
  stream_id: string;
  agent_id: string;
  type: 'content' | 'complete' | 'error';
  content?: string;
  typewriter?: TypewriterChunk;
  timestamp: number;
}