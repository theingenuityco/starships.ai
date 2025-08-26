// ============================================================================
// MAIN PROTOCOL EXPORTS
// ============================================================================

// Export contract types (API boundaries)
export * from './contracts/agent';
export * from './contracts/chat';
export * from './contracts/llm';
export * from './contracts/socket';

// Export entity types (database collections)
export * from './entities/mission';
export * from './entities/starship';
export * from './entities/vision';
export * from './entities/workflow';
export * from './entities/user';
export * from './entities/waitlist';

// Export entity types with explicit naming to avoid conflicts
export type {
  LLM,
  LLMProviderType,
  CreateLLMRequest,
  UpdateLLMRequest,
  LLMResponse,
  LLMListResponse,
  LLMFilters,
  LLMSort
} from './entities/llm';

export type {
  AgentTemplate,
  AgentTemplateCategory,
  CreateAgentTemplateRequest,
  UpdateAgentTemplateRequest,
  AgentTemplateResponse,
  AgentTemplateListResponse,
  AgentTemplateFilters,
  AgentTemplateSort,
  AgentTemplateUsage,
  IncrementTemplateUsageRequest,
  RateTemplateRequest
} from './entities/agent-template';

// Export Sibil types with explicit exports to avoid conflicts
export type {
  ContentBlock,
  SibilRequest,
  SibilResponse,
  SibilStreamRequest,
  SibilStreamChunk,
  SibilStreamResponse,
  SibilSocketRequest,
  SibilSocketStreamChunk,
  SibilStreamError,
  AgentSocketRequest,
  AgentSocketStreamChunk,
  AgentChatResponse,
  AgentStreamError,
  SocketConnectionState,
} from './contracts/sibil';

// Export socket types
export type {
  EventEmissionOptions,
  EventEmissionResult,
} from './contracts/socket';

