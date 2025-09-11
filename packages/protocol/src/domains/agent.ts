/**
 * Database Agent Types
 *
 * Database-specific agent interfaces and API contract types.
 * Imports workflow and memory types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type { AgentMemoryState, Blueprint, AgentNodeParameters } from '@starships/autopilot';

// ============================================================================
// DATABASE AGENT INTERFACE
// ============================================================================

/**
 * Database Agent interface - core API contract type
 * Extends AgentNodeParameters to be a superset with additional database/marketplace fields
 */
export interface AgentModel extends Omit<AgentNodeParameters, 'metadata'> {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;
  version: string;

  // Marketplace fields
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  usageCount: number;
  isPublic?: boolean;
  authorId?: string;

  // Template relationship
  templateId?: string;

  // Deployment settings
  starshipId: string;
}

// ============================================================================
// AGENT REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new agent
 */
export interface CreateAgentRequest {
  name: string;
  description?: string;
  category: AgentModel['category'];
  model: string;
  temperature?: number;
  maxTokens?: number;
  templateId?: string; // Reference to template if agent is created from template
  starshipId: string; // REQUIRED for new agents

  // Autopilot-specific fields (optional for backward compatibility)
  blueprint?: Blueprint;
  memory?: AgentMemoryState;
  timeout?: number;
}

/**
 * Request to update an agent
 */
export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  version?: string;
  starshipId?: string; // Allow updating starship assignment
}

// ============================================================================
// AGENT COLLECTION-SPECIFIC TYPES
// ============================================================================

/**
 * Agent database response with pagination
 */
export interface AgentListResponse {
  agents: AgentModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Agent response with single agent
 */
export interface AgentResponse {
  agent: AgentModel;
}

/**
 * Request to search agents
 */
export interface SearchAgentsRequest {
  query: string;
  category?: string;
  limit?: number;
  offset?: number;
}

/**
 * Response for search agents
 */
export interface SearchAgentsResponse {
  agents: AgentModel[];
  total: number;
  searchQuery: string;
}

/**
 * Request to filter agents
 */
export interface AgentFilters {
  category?: string;
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

/**
 * Agent performance analytics
 */
export interface AgentAnalytics {
  agentId: string;
  totalInvocations: number;
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  last30DaysUsage: number;
  ratings: {
    average: number;
    total: number;
    distribution: Record<number, number>;
  };
}
