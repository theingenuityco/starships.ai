// Connection
export { createConnection, getConnection, Neo4jConnection } from './helpers/database';
export type { Neo4jConfig } from './helpers/database';

// Utils
export { convertNeo4jInt, convertNeo4jIntsInObject } from './helpers/database';


// Repository implementations
export { AgentRepository } from './repositories/AgentRepository';
export { UserRepository } from './repositories/UserRepository';
export { LLMRepository } from './repositories/LLMRepository';
export { WaitlistRepository } from './repositories/WaitlistRepository';

// Aether Core Repository implementations
export { StarshipRepository } from './repositories/StarshipRepository';
export { VisionRepository } from './repositories/VisionRepository';
export { MissionRepository } from './repositories/MissionRepository';
export { MissionMessageRepository } from './repositories/MissionMessageRepository';
export { WorkflowRepository } from './repositories/WorkflowRepository';
export { WorkflowNodeRepository } from './repositories/WorkflowNodeRepository';
export { WorkflowEdgeRepository } from './repositories/WorkflowEdgeRepository';
export { WorkflowRuntimeStateRepository } from './repositories/WorkflowRuntimeStateRepository';
export { MissionClarityRepository } from './repositories/MissionClarityRepository';
export { NativeToolApiKeyRepository } from './repositories/NativeToolApiKeyRepository';

// NEW: Agent Templates
export { AgentTemplateRepository } from './repositories/AgentTemplateRepository';

// Factory for creating repositories
export { RepositoryFactory } from './repositories';

// NEW: Export AgentTemplateService
export { AgentTemplateService } from './services/AgentTemplateService';
// NEW: Export VisionFileService
export { VisionFileService } from './services/VisionFileService';


// Export standardized error handling system from protocol
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
} from '@starships/protocol';

// Export ConstraintViolationError from helpers for backward compatibility
export { ConstraintViolationError } from './helpers/errors';

export type {
  ErrorCategory,
  ErrorSeverity,
  ErrorInfo,
  ErrorContext,
  ErrorResponse,
  StandardErrorCode
} from '@starships/protocol';

// Export LLM domain types from protocol
export type {
  LLM,
  LLMProviderType,
  CreateLLMRequest,
  UpdateLLMRequest,
  LLMResponse,
  LLMListResponse,
  LLMFilters,
  LLMSort
} from '@starships/protocol';

// NEW: Export structured logging and monitoring system
export {
  Logger,
  PerformanceMonitor,
  HealthMonitor,
  RequestContext,
  logger,
} from './helpers/logging';

export type {
  LogLevel,
  LogContext,
  PerformanceMetrics,
  HealthStatus
} from './helpers/logging';

// Export scripts
export { seedLLMModels } from './scripts/seed-llm-models';
export { seedWaitlist } from './scripts/seed-waitlist';
