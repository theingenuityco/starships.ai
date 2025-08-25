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
  TypewriterChunk,
  SibilSocketStreamChunk,
  SibilStreamError,
  AgentSocketRequest,
  AgentSocketStreamChunk,
  AgentChatResponse,
  AgentStreamError,
  SocketConnectionState,
  LegacySocketIOEvents
} from './contracts/sibil';

// Export mission phase config with explicit exports to avoid conflicts
export type {
  MissionPhaseConfig
} from './constants/mission-phases';

export {
  MISSION_PHASE_CONFIG,
  getMissionPhaseConfig,
  getMissionPhasesInOrder,
  getNextMissionPhase,
  getPreviousMissionPhase
} from './constants/mission-phases';

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

// Re-export specific types to avoid conflicts
export type {
  EnhancedSocketIOEvents,
  EventEmissionOptions,
  EventEmissionResult,
} from './contracts/socket';

// Re-export error classes with explicit naming to avoid conflicts
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
