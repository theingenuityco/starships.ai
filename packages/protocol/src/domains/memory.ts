/**
 * Database Memory Types
 *
 * Database-specific memory interfaces and API contract types.
 * Imports memory types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type { MemoryState, AgentMemoryState, AgentIdentity, AgentPurpose, AgentSpace } from '@starships/autopilot';

// ============================================================================
// DATABASE MEMORY INTERFACE
// ============================================================================

/**
 * Database Memory interface - core API contract type
 * Contains state as a key instead of inheritance for better serialization
 */
export interface MemoryModel {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;
  version: string;

  // Database-specific computed field
  messageCount: number;

  // State container
  state: MemoryState;
}

// ============================================================================
// MEMORY REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new memory
 */
export interface CreateMemoryRequest {
  // Starship ID for establishing HAS_MEMORY relationship
  starshipId: string;

  // Memory state
  state?: MemoryState;

  // Initial messages (optional) - deprecated in favor of state
  /** @deprecated Use state.messages instead */
  initialMessages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Request to create a new agent memory
 */
export interface CreateAgentMemoryRequest {
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
  state?: AgentMemoryState;
}

/**
 * Request to update a memory
 */
export interface UpdateMemoryRequest {
  version?: string;
}

/**
 * Request to update an agent memory
 */
export interface UpdateAgentMemoryRequest {
  version?: string;
}

// ============================================================================
// MEMORY COLLECTION-SPECIFIC TYPES
// ============================================================================

/**
 * Memory database response with pagination
 */
export interface MemoryListResponse {
  memories: MemoryModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * AgentMemory database response with pagination
 */
export interface AgentMemoryListResponse {
  memories: MemoryModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Memory response with single memory
 */
export interface MemoryResponse {
  memory: MemoryModel;
}

/**
 * AgentMemory response with single agent memory
 */
export interface AgentMemoryResponse {
  memory: MemoryModel;
}

/**
 * Request to search memories
 */
export interface SearchMemoriesRequest {
  query: string;
  limit?: number;
  offset?: number;
}

/**
 * Response for search memories
 */
export interface SearchMemoriesResponse {
  memories: MemoryModel[];
  total: number;
  searchQuery: string;
}

/**
 * Request to filter memories
 */
export interface MemoryFilters {
  starshipId?: string; // Filter memories by starship using Neo4j relationships
  hasMessages?: boolean;
  agentId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Memory usage statistics
 */
export interface MemoryUsageStats {
  memoryId: string;
  totalMessages: number;
  last30DaysMessages: number;
  lastUpdatedAt: string | null;
  sizeInBytes: number;
}

/**
 * Memory analytics
 */
export interface MemoryAnalytics {
  memoryId: string;
  totalMessages: number;
  messagesByRole: {
    system: number;
    user: number;
    assistant: number;
  };
  averageMessageLength: number;
  createdAt: string;
  lastActivityAt: string | null;
  linkedAgents: string[];
}
