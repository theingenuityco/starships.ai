/**
 * Chat Contract Types
 * 
 * Core chat interface definitions for agent and LLM communication.
 */

// ============================================================================
// USAGE STATISTICS
// ============================================================================

/**
 * LLM usage statistics
 */
export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
}

// ============================================================================
// CHAT REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Chat request for agent communication
 */
export interface ChatRequest {
  agent_id: string;
  user_id: string;
  message: string;
  stream?: boolean;
}

/**
 * Chat response from agent
 */
export interface ChatResponse {
  reply: string;
  usage?: UsageStats;
}

// ============================================================================
// MEMORY TYPES
// ============================================================================

/**
 * Basic memory entry for conversation history
 */
export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/**
 * Enhanced memory entry with additional metadata
 */
export interface EnhancedMemoryEntry extends MemoryEntry {
  importance?: number;
  summary?: string;
}

/**
 * Memory search result
 */
export interface MemorySearchResult {
  entries: EnhancedMemoryEntry[];
  relevanceScores: number[];
}

/**
 * Session key for memory management
 */
export type SessionKey = string;