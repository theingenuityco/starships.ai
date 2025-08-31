/**
 * Agent Domain Types
 *
 * Consolidated agent interface definitions and domain-specific types.
 * Moved from contracts/agent.ts as agents are now domain concepts.
 * Extended to support autopilot workflow execution system.
 */

// ============================================================================
// AUTOPILOT WORKFLOW TYPES
// ============================================================================

/**
 * Workflow node types supported by autopilot
 */
export type AutopilotNodeType =
  | 'agent'
  | 'conditional'
  | 'user_prompt'
  | 'output'
  | 'start'
  | 'end'
  | 'http_request'
  | 'llm'
  | 'workflow';

/**
 * Base workflow node interface
 */
export interface AutopilotNode {
  ref: string;
  type: AutopilotNodeType;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Workflow edge connecting nodes
 */
export interface AutopilotEdge {
  ref: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Workflow blueprint definition
 */
export interface AutopilotBlueprint {
  nodes: AutopilotNode[];
  edges: AutopilotEdge[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AGENT MEMORY TYPES
// ============================================================================

/**
 * Agent identity configuration
 */
export interface AgentIdentity {
  name?: string;
  role?: string;
  personality?: string;
  expertise?: string[];
}

/**
 * Agent purpose and goals
 */
export interface AgentPurpose {
  primary: string;
  secondary?: string[];
  constraints?: string[];
}

/**
 * Agent space information (contextual background)
 */
export interface AgentSpace {
  description: string;
}

/**
 * Agent memory configuration for autopilot
 */
export interface AgentMemoryConfig {
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
}

// ============================================================================
// CORE AGENT INTERFACE
// ============================================================================

/**
 * Agent interface - core API contract type
 * Extended to support autopilot workflow execution
 */
export interface Agent {
  // Existing fields
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
  blueprint?: AutopilotBlueprint;           // Workflow definition for complex agents
  agentMemoryConfig?: AgentMemoryConfig;    // Structured memory configuration
  executionMode: 'simple' | 'workflow';    // Execution type (backward compatibility)
  timeout?: number;                         // Execution timeout in milliseconds
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
  blueprint?: AutopilotBlueprint;           // Workflow definition
  agentMemoryConfig?: AgentMemoryConfig;    // Memory configuration
  executionMode?: 'simple' | 'workflow';   // Execution type (defaults to 'simple')
  timeout?: number;                         // Execution timeout
}

/**
 * Request to update an agent
 */
export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  version?: string;
  starshipId?: string; // Allow updating starship assignment
}

// ============================================================================
// AGENT TEMPLATE SYSTEM
// ============================================================================

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

// ============================================================================
// AGENT ANALYTICS
// ============================================================================

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