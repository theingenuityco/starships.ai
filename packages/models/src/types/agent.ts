/**
 * Database Agent Types
 *
 * Database-specific agent interfaces and API contract types.
 * Imports workflow and memory types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type {
  AgentMemoryConfig,
  Blueprint,
  AgentNodeParameters
} from '@starships/autopilot';

// ============================================================================
// DATABASE AGENT INTERFACE
// ============================================================================

/**
 * Database Agent interface - core API contract type
 * Extends AgentNodeParameters to be a superset with additional database/marketplace fields
 */
export interface AgentModel extends Omit<AgentNodeParameters, 'memory' | 'blueprint'> {
  // Core database fields
  id: string;
  systemPrompt?: string;
  createdAt: string;

  // Enhanced marketplace fields
  tags: string[];
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  authorId: string;
  isPublic: boolean;
  version: string;
  updatedAt: string;
  usageCount: number;
  rating?: number;

  // Deployment settings
  starshipId: string;
  allowedStarshipClasses?: ('scout' | 'cruiser' | 'draught')[];
  requiredPermissions?: string[];

  // Autopilot integration fields (optional for database persistence)
  blueprint?: Blueprint;
  memory?: AgentMemoryConfig;
  agentMemoryConfig?: AgentMemoryConfig; // Backward compatibility alias for memory
  executionMode: 'simple' | 'workflow';
}

/**
 * Agent configuration interface
 * Extends AgentModel with runtime configuration options
 */
export interface AgentConfig extends AgentModel {
  provider?: 'openai' | 'anthropic';
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
  systemPrompt?: string;
  model: string;
  tags?: string[];
  isPublic?: boolean;
  temperature?: number;
  maxTokens?: number;
  instructions?: string;
  allowedStarshipClasses?: ('scout' | 'cruiser' | 'draught')[];
  authorId?: string;
  starshipId: string; // REQUIRED for new agents

  // Autopilot-specific fields (optional for backward compatibility)
  blueprint?: Blueprint;
  memory?: AgentMemoryConfig;
  executionMode?: 'simple' | 'workflow';
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
  agents: AgentModel[];
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
