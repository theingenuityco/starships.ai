// ============================================================================
// MAIN PROTOCOL EXPORTS
// ============================================================================

// Export contract types (API boundaries)
export * from './contracts/chat';
export * from './contracts/sibil';
export * from './contracts/socket';

// Export domain types (database domains)
export * from './domains/agent';
export * from './domains/llm';
export * from './domains/mission';
export * from './domains/starship';
export * from './domains/vision';
export * from './domains/workflow';
export * from './domains/user';
export * from './domains/waitlist';
export * from './domains/native-tool';

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
} from './domains/llm';

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
} from './domains/agent-template';


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

