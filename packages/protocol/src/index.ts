// ============================================================================
// MAIN PROTOCOL EXPORTS
// ============================================================================

// Export unified chat and socket contract types (API boundaries)
export * from './contracts/chat-socket';

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

// Export Chat and Socket types with explicit exports to avoid conflicts
export type {
  // Basic types
  UsageStats,
  MemoryEntry,
  EnhancedMemoryEntry,
  MemorySearchResult,
  SessionKey,
  
  // Content and typewriter
  TypewriterData,
  ContentBlock,
  
  // Chat types (works for both REST and Socket.IO)
  ChatSourceType,
  ChatRequest,
  ChatResponse,
  ChatStreamRequest,
  ChatStreamChunk,
  ChatStreamResponse,
  
  // Socket.IO enhanced types
  ChatSocketRequest,
  ChatSocketStreamChunk,
  ChatSocketResponse,
  ChatSocketStreamError,
  ChatSocketStreamResponse,
  
  // Connection and socket types
  SocketConnectionState,
  BaseSocketEvents,
  ConnectionStatusEvent,
  ConnectionStatus,
  ChatSocketEvents,
  ChatSocketIOEvents,
  SocketEvents,
  SocketEventData,
  EventEmissionOptions,
  EventEmissionResult,
} from './contracts/chat-socket';

// Export Vision Socket Events
export type {
  VisionSocketEvents,
} from './domains/vision';

