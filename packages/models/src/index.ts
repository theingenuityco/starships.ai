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
export { ChatSessionRepository } from './repositories/ChatSessionRepository';
export { ChatMessageRepository } from './repositories/ChatMessageRepository';

// Aether Core Repository implementations
export { StarshipRepository } from './repositories/StarshipRepository';
export { VisionRepository } from './repositories/VisionRepository';
export { MissionRepository } from './repositories/MissionRepository';
export { MissionMessageRepository } from './repositories/MissionMessageRepository';
export { BlueprintRepository } from './repositories/BlueprintRepository';
export { NodeRepository } from './repositories/NodeRepository';
export { EdgeRepository } from './repositories/EdgeRepository';
export { WorkflowRuntimeStateRepository } from './repositories/WorkflowRuntimeStateRepository';
export { MissionClarityRepository } from './repositories/MissionClarityRepository';
export { NativeToolApiKeyRepository } from './repositories/NativeToolApiKeyRepository';

// NEW: Agent Templates
export { AgentTemplateRepository } from './repositories/AgentTemplateRepository';

// Factory for creating repositories
export { RepositoryFactory } from './repositories';



// Export error classes from local implementation (models package)
export {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ConstraintViolationError,
  DatabaseError,
  NetworkError,
  RateLimitError,
  ServiceUnavailableError,
  InternalServerError,
  ErrorFactory,
  ErrorUtils
} from './helpers/errors';

// Export local error types
export { ErrorSeverity } from './helpers/logging/error-monitor';
export { ErrorCategory } from './helpers/errors';

// Export LLM collection types from protocol
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



// Export agent types
export type {
  AgentModel,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentListResponse,
  AgentResponse,
  SearchAgentsRequest,
  SearchAgentsResponse,
  AgentFilters,
  DeployAgentRequest,
  DeployAgentResponse,
  AgentUsageStats,
  AgentAnalytics
} from './types/agent';

// Export agent template types
export type {
  AgentTemplateModel,
  AgentTemplateCategory,
  CreateAgentTemplateRequest,
  UpdateAgentTemplateRequest,
  AgentTemplateResponse,
  AgentTemplateListResponse,
  AgentTemplateFilters,
  AgentTemplateSort,
  AgentTemplateUsage,
  IncrementTemplateUsageRequest
} from './types/agent-template';

// Export autopilot-based types
export type {
  NodeModel,
  CreateNodeRequest,
  UpdateNodeRequest,
  NodeListResponse,
  NodeResponse,
  SearchNodesRequest,
  SearchNodesResponse,
  NodeFilters
} from './types/node';

export type {
  EdgeModel,
  CreateEdgeRequest,
  UpdateEdgeRequest,
  EdgeListResponse,
  EdgeResponse,
  SearchEdgesRequest,
  SearchEdgesResponse,
  EdgeFilters
} from './types/edge';

export type {
  BlueprintModel,
  CreateBlueprintRequest,
  UpdateBlueprintRequest,
  BlueprintListResponse,
  BlueprintResponse,
  SearchBlueprintsRequest,
  SearchBlueprintsResponse,
  BlueprintFilters,
  BlueprintUsageStats
} from './types/blueprint';

// Export scripts
export { seedLLMModels } from './scripts/seed-llm-models';
export { seedWaitlist } from './scripts/seed-waitlist';
export { migrationRunner } from './scripts/migration-runner';
