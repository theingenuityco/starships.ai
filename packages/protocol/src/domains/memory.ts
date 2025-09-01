/**
 * Database Memory Types
 *
 * Database-specific memory interfaces and API contract types.
 * Imports memory types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type {
  MemoryState,
  AgentMemoryState,
  AgentIdentity,
  AgentPurpose,
  AgentSpace
} from '@starships/autopilot';

// ============================================================================
// DATABASE MEMORY INTERFACE
// ============================================================================

/**
 * Database Memory interface - core API contract type
 * Extends MemoryState from autopilot with database fields
 */
export interface MemoryStateModel extends MemoryState {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;
  version: string;

  // Database-specific computed field
  messageCount: number;
}

/**
 * Database AgentMemory interface - extends AgentMemoryState from autopilot with database fields
 */
export interface AgentMemoryStateModel extends AgentMemoryState {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;
  version: string;

  // Database-specific computed field
  messageCount: number;
}

// ============================================================================
// MEMORY REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new memory
 */
export interface CreateMemoryRequest {
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
export interface CreateAgentMemoryRequest extends CreateMemoryRequest {
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
  state?: AgentMemoryState;
}

/**
 * Request to update a memory
 */
export interface UpdateMemoryRequest extends Partial<CreateMemoryRequest> {
  version?: string;
}

/**
 * Request to update an agent memory
 */
export interface UpdateAgentMemoryRequest extends Partial<CreateAgentMemoryRequest> {
  version?: string;
}

// ============================================================================
// MEMORY COLLECTION-SPECIFIC TYPES
// ============================================================================

/**
 * Memory database response with pagination
 */
export interface MemoryListResponse {
  memories: MemoryStateModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * AgentMemory database response with pagination
 */
export interface AgentMemoryListResponse {
  memories: AgentMemoryStateModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Memory response with single memory
 */
export interface MemoryResponse {
  memory: MemoryStateModel;
}

/**
 * AgentMemory response with single agent memory
 */
export interface AgentMemoryResponse {
  memory: AgentMemoryStateModel;
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
  memories: MemoryStateModel[];
  total: number;
  searchQuery: string;
}

/**
 * Request to filter memories
 */
export interface MemoryFilters {
  hasMessages?: boolean;
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