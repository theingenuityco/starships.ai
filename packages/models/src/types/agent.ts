/**
 * Database Agent Types
 *
 * Database-specific agent interfaces and API contract types.
 * Imports workflow and memory types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type {
  AgentIdentity,
  AgentPurpose,
  AgentSpace,
  Blueprint
} from '@starships/autopilot';

/**
 * Agent memory configuration for autopilot
 */
export interface AgentMemoryConfig {
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
}

// ============================================================================
// DATABASE AGENT INTERFACE
// ============================================================================

/**
 * Database Agent interface - core API contract type
 */
export interface Agent {
  // Core fields
  id: string;
  name: string;
  model: string;
  systemPrompt?: string;
  createdAt: string;

  // Enhanced marketplace fields
  description?: string;
  tags: string[];
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  authorId: string;
  isPublic: boolean;
  version: string;
  updatedAt: string;
  usageCount: number;
  rating?: number;

  // Advanced configuration
  temperature?: number;
  maxTokens?: number;
  customInstructions?: string;

  // Deployment settings
  starshipId: string;
  allowedStarshipClasses?: ('scout' | 'cruiser' | 'draught')[];
  requiredPermissions?: string[];

  // Autopilot integration fields
  blueprint?: Blueprint;
  agentMemoryConfig?: AgentMemoryConfig;
  executionMode: 'simple' | 'workflow';
  timeout?: number;
}

/**
 * Agent configuration interface
 */
export interface AgentConfig extends Agent {
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
  category: Agent['category'];
  systemPrompt?: string;
  model: string;
  tags?: string[];
  isPublic?: boolean;
  temperature?: number;
  maxTokens?: number;
  customInstructions?: string;
  allowedStarshipClasses?: ('scout' | 'cruiser' | 'draught')[];
  authorId?: string;
  starshipId: string; // REQUIRED for new agents

  // Autopilot-specific fields (optional for backward compatibility)
  blueprint?: Blueprint;
  agentMemoryConfig?: AgentMemoryConfig;
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

/**
 * Agent template for marketplace
 */
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  tags: string[];

  // Template configuration
  systemPrompt: string;
  model: string; // References LLM.id
  temperature?: number;
  maxTokens?: number;

  // Template metadata
  authorId: string;
  isPublic: boolean;
  usageCount: number;
  rating?: number;

  // Template preview
  icon?: string;
  previewPrompts?: string[]; // Example prompts to show what the template can do

  createdAt: string;
  updatedAt: string;
}