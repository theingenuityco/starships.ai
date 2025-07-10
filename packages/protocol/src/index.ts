export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatRequest {
  agent_id: string;
  user_id: string;
  channel_id?: string;
  message: string;
  stream?: boolean;
}

export interface ChatResponse {
  reply: string;
  usage?: UsageStats;
}

// Define Agent interface directly to avoid circular dependency
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
  allowedStarshipClasses?: ('scout' | 'cruiser')[];
  requiredPermissions?: string[];
}

export interface AgentConfig extends Agent {
  provider?: 'openai' | 'anthropic';
}

// ADD: New interfaces for enhanced functionality
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
  allowedStarshipClasses?: ('scout' | 'cruiser')[];
}

export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  version?: string;
}

export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface EnhancedMemoryEntry extends MemoryEntry {
  embedding?: number[];
  importance?: number;
  summary?: string;
}

export interface MemorySearchResult {
  entries: EnhancedMemoryEntry[];
  relevanceScores: number[];
}

export type SessionKey = string;

export interface LLMChatPrompt {
  messages: Array<{ role: 'system' | 'assistant' | 'user'; content: string }>;
}

export interface LLMResult {
  reply: string;
  usage?: UsageStats;
}

export interface LLMProvider {
  complete(
    prompt: LLMChatPrompt,
    opts?: {
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMResult>;
}
