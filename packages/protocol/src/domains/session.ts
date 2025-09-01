/**
 * Session Domain Types
 *
 * Types for session functionality including requests, responses, and streaming
 */

// ============================================================================
// SESSION REQUEST/RESPONSE TYPES
// ============================================================================

// ============================================================================
// SESSION SOURCE TYPE
// ============================================================================

/**
 * Session source type
 */
export type SessionSourceType = 'agent' | 'sibil' | 'user';

/**
 * Base session request interface
 */
export interface SessionRequest {
  source: SessionSourceType;
  agent_id?: string;
  user_id?: string;
  message: string;
  session_id?: string;
  stream?: boolean;
  stream_id?: string;
  typing_speed?: number;
  typewriter_enabled?: boolean;
  context?: Record<string, unknown>;
}

/**
 * Base session response interface
 */
export interface SessionResponse {
  source: SessionSourceType;
  content: string;
  agent_id?: string;
  session_id?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens?: number;
    cost?: number;
  };
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Session stream chunk for real-time streaming
 */
export interface SessionStreamChunk {
  source: SessionSourceType;
  stream_id: string;
  agent_id?: string;
  type: 'content' | 'status' | 'error' | 'complete';
  content: string;
  typewriter?: {
    type: 'character' | 'word' | 'line';
    content: string;
    position: number;
    total_length: number;
    delay: number;
    is_code?: boolean;
    is_markdown?: boolean;
  };
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

/**
 * Session information
 */
export interface Session {
  id: string;
  source: SessionSourceType;
  agent_id?: string;
  user_id?: string;
  starship_id?: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  message_count: number;
  total_tokens?: number;
  status: 'active' | 'paused' | 'completed' | 'archived';
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SESSION ERROR TYPES
// ============================================================================

/**
 * Session error response
 */
export interface SessionError {
  stream_id?: string;
  agent_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
  metadata?: Record<string, unknown>;
}