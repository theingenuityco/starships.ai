/**
 * Database Memory Types
 *
 * Database-specific memory interfaces and API contract types.
 * Imports memory types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type {
  Memory,
  AgentMemory,
  AgentMemoryConfig,
  AgentIdentity,
  AgentPurpose,
  AgentSpace
} from '@starships/autopilot';

// ============================================================================
// DATABASE MEMORY INTERFACE
// ============================================================================

/**
 * Database Memory interface - core API contract type
 * Extends base Memory functionality with database fields
 */
export interface MemoryModel {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;
  version: string;

  // Memory content
  messages: any[]; // JSON serialized messages from Memory class
  messageCount: number;
  
  // Ownership
  starshipId: string;
  agentId?: string; // Optional agent assignment

  // Memory metadata
  name?: string;
  description?: string;
  tags?: string[];
}

/**
 * Database AgentMemory interface - extends MemoryModel with agent-specific fields
 */
export interface AgentMemoryModel extends MemoryModel {
  // Agent-specific memory fields
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
  
  // Agent memory configuration
  config?: AgentMemoryConfig;
  
  // Required agent assignment for AgentMemory
  agentId: string;
}

// ============================================================================
// MEMORY REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new memory
 */
export interface CreateMemoryRequest {
  name?: string;
  description?: string;
  starshipId: string;
  agentId?: string;
  tags?: string[];
  
  // Initial messages (optional)
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
  agentId: string; // Required for agent memory
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
  config?: AgentMemoryConfig;
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
  memories: AgentMemoryModel[];
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
  memory: AgentMemoryModel;
}

/**
 * Request to search memories
 */
export interface SearchMemoriesRequest {
  query: string;
  starshipId?: string;
  agentId?: string;
  tags?: string[];
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
  starshipId?: string;
  agentId?: string;
  tags?: string[];
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