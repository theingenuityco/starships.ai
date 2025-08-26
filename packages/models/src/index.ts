// Connection
export { createConnection, getConnection, Neo4jConnection } from './helpers/database';
export type { Neo4jConfig } from './helpers/database';

// Utils
export { convertNeo4jInt, convertNeo4jIntsInObject } from './helpers/database';

// Types (interfaces only)
export * from './types';

// Repository implementations
export { AgentRepository } from './repositories/AgentRepository';
export { UserRepository } from './repositories/UserRepository';
export { LLMRepository } from './repositories/LLMRepository';
export { WaitlistRepository } from './repositories/WaitlistRepository';

// Aether Core Repository implementations
export { StarshipRepository } from './repositories/StarshipRepository';
export { VisionRepository } from './repositories/VisionRepository';

// NEW: Agent Templates
export { Neo4jAgentTemplateRepository } from './repositories/AgentTemplateRepository';

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

export type {
  ErrorCategory,
  ErrorSeverity,
  ErrorInfo,
  ErrorContext,
  ErrorResponse,
  StandardErrorCode
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
