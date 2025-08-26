/**
 * Agent Contract Types
 * 
 * Core agent interface definitions for cross-package communication.
 */

// ============================================================================
// CORE AGENT INTERFACE
// ============================================================================

/**
 * Agent interface - core API contract type
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