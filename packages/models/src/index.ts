// Connection
export { createConnection, getConnection, Neo4jConnection } from './connection';
export type { Neo4jConfig } from './connection';

// Utils
export { convertNeo4jInt, convertNeo4jIntsInObject } from './utils/neo4j-helpers';

// Types (interfaces only)
export * from './types';

// Repository implementations
export { AgentRepository } from './repositories/AgentRepository';
export { UserRepository } from './repositories/UserRepository';
export { LLMRepository } from './repositories/LLMRepository';

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


// NEW: Export comprehensive error handling system
export {
  BaseError,
  ErrorFactory,
  ErrorUtils,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  NetworkError,
  RateLimitError,
  ServiceUnavailableError,
  InternalServerError,
  // Re-export enhanced versions with new names to avoid conflicts
  ValidationError as EnhancedValidationError,
  ConstraintViolationError as EnhancedConstraintViolationError,
  NotFoundError as EnhancedNotFoundError,
} from './errors';

export type {
  ErrorCategory,
  ErrorDetails
} from './errors';

// NEW: Export structured logging and monitoring system
export {
  Logger,
  PerformanceMonitor,
  HealthMonitor,
  RequestContext,
  logger,
} from './logging';

export type {
  LogLevel,
  LogContext,
  PerformanceMetrics,
  HealthStatus
} from './logging';

// Export scripts
export { seedLLMModels } from './scripts/seed-llm-models';
