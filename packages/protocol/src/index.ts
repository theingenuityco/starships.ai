// ============================================================================
// MAIN PROTOCOL EXPORTS
// ============================================================================

// Export core error handling
export * from './core/errors';

// Export contract types (API boundaries)
export * from './contracts/agent';
export * from './contracts/chat';
export * from './contracts/llm';
export * from './contracts/socket';

// Export domain types (business entities)
export * from './domain/mission';
export * from './domain/starship';
export * from './domain/vision';
export * from './domain/workflow';

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

// Export error classes
export {
  StandardError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  NetworkError,
  BusinessLogicError,
  ErrorFactory,
  isStandardError
} from './core/errors';
