// ============================================================================
// AGENT COLLECTION TYPES
// ============================================================================

// Import Agent types from contracts to use in collection-specific interfaces
import type { Agent } from '../contracts/agent';

// Re-export Agent types from contracts as they serve as both API contracts and database domains
export type {
  Agent,
  AgentConfig,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentAnalytics
} from '../contracts/agent';
// ============================================================================
// AGENT COLLECTION-SPECIFIC TYPES
// ============================================================================

/**
 * Agent database response with pagination
 */
export interface AgentListResponse {
  agents: Agent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Agent response with single agent
 */
export interface AgentResponse {
  agent: Agent;
}

/**
 * Request to search agents
 */
export interface SearchAgentsRequest {
  query: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  authorId?: string;
  starshipClass?: 'scout' | 'cruiser';
  limit?: number;
  offset?: number;
}

/**
 * Response for search agents
 */
export interface SearchAgentsResponse {
  agents: Agent[];
  total: number;
  searchQuery: string;
}

/**
 * Request to filter agents
 */
export interface AgentFilters {
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  authorId?: string;
  starshipClass?: 'scout' | 'cruiser';
  starshipId?: string;
}

/**
 * Agent deployment request
 */
export interface DeployAgentRequest {
  agentId: string;
  starshipId: string;
}

/**
 * Agent deployment response
 */
export interface DeployAgentResponse {
  success: boolean;
  message: string;
  deployment?: {
    agentId: string;
    starshipId: string;
    deployedAt: string;
  };
}

/**
 * Agent usage statistics
 */
export interface AgentUsageStats {
  agentId: string;
  totalUsage: number;
  last30Days: number;
  lastUsedAt: string | null;
}