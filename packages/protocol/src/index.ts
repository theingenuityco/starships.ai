// ============================================================================
// MAIN PROTOCOL EXPORTS
// ============================================================================


// Export contract types (API boundaries)
export * from './contracts/socket';

// Export domain types (database domains)
export * from './domains/chat';
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


// Export Vision Socket Events
export type {
  VisionSocketEvents,
} from './domains/vision';

