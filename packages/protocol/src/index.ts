// ============================================================================
// MAIN PROTOCOL EXPORTS
// ============================================================================

// Export contract types (API boundaries)
export * from './contracts/agent';
export * from './contracts/chat';
export * from './contracts/llm';
export * from './contracts/socket';

// Export collection types (database collections)
export * from './collections/mission';
export * from './collections/starship';
export * from './collections/vision';
export * from './collections/workflow';
export * from './collections/user';
export * from './collections/waitlist';

// Export collection types with explicit naming to avoid conflicts
export type {
  LLM,
  LLMProviderType,
  CreateLLMRequest,
  UpdateLLMRequest,
  LLMResponse,
  LLMListResponse,
  LLMFilters,
  LLMSort
} from './collections/llm';

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
} from './collections/agent-template';

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

