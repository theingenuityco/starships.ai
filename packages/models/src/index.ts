// Connection
export { createConnection, getConnection, Neo4jConnection } from './helpers/database';
export type { Neo4jConfig } from './helpers/database';

// Utils
export { convertNeo4jInt, convertNeo4jIntsInObject } from './helpers/database';


// Repository implementations
export { AgentRepository } from './repositories/AgentRepository';
export { UserRepository } from './repositories/UserRepository';
export { WaitlistRepository } from './repositories/WaitlistRepository';

// Aether Core Repository implementations
export { StarshipRepository } from './repositories/StarshipRepository';
export { MissionRepository } from './repositories/MissionRepository';
export { MissionMessageRepository } from './repositories/MissionMessageRepository';
export { BlueprintRepository } from './repositories/BlueprintRepository';
export { NodeRepository } from './repositories/NodeRepository';
export { EdgeRepository } from './repositories/EdgeRepository';
export { MissionClarityRepository } from './repositories/MissionClarityRepository';

export { NativeToolApiKeyRepository } from './repositories/NativeToolApiKeyRepository';

// NEW: Agent Templates
export { AgentTemplateRepository } from './repositories/AgentTemplateRepository';

// NEW: Workflows
export { WorkflowRepository } from './repositories/WorkflowRepository';

// NEW: Memory and Message repositories
export { MemoryRepository } from './repositories/MemoryRepository';
export { MessageRepository } from './repositories/MessageRepository';

// Factory for creating repositories
export { RepositoryFactory } from './repositories';



// Export error classes from @starships/errors package
export {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  NetworkError,
  ServiceUnavailableError,
  InternalServerError,
  RateLimitError,
  ErrorUtils,
  ErrorCategory
} from '@starships/errors';



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



// All domain model types have been moved to @starships/protocol
// Repository implementations remain in this package for data access

// Export scripts
export { seedWaitlist } from './scripts/seed-waitlist';
export { migrationRunner } from './scripts/migration-runner';
