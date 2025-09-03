/**
 * @fileoverview Main entry point for @starships/models package
 *
 * This module exports all public APIs for the Starships.ai data access layer,
 * including database connections, repositories, utilities, and management scripts.
 *
 * @module @starships/models
 * @version 1.0.0
 * @author Starships.ai Development Team
 */

// ============================================================================
// DATABASE CONNECTION & CONFIGURATION
// ============================================================================

/**
 * Database connection utilities for Neo4j graph database
 * @see {@link ./helpers/database} for detailed connection management
 */
export { createConnection, getConnection, Neo4jConnection } from './helpers/database';
export type { Neo4jConfig } from './helpers/database';

// ============================================================================
// DATABASE UTILITIES
// ============================================================================

/**
 * Neo4j data conversion utilities for handling integer types
 * @see {@link ./helpers/database/neo4j-helpers} for conversion functions
 */
export { convertNeo4jInt, convertNeo4jIntsInObject } from './helpers/database';

// ============================================================================
// DATA REPOSITORIES
// ============================================================================

/**
 * Core entity repositories for data access operations
 * All repositories extend BaseRepository and provide standardized CRUD operations
 */
export { AgentRepository } from './repositories/AgentRepository';
export { UserRepository } from './repositories/UserRepository';
export { StarshipRepository } from './repositories/StarshipRepository';
export { MissionRepository } from './repositories/MissionRepository';
export { MissionMessageRepository } from './repositories/MissionMessageRepository';
export { BlueprintRepository } from './repositories/BlueprintRepository';
export { NodeRepository } from './repositories/NodeRepository';
export { EdgeRepository } from './repositories/EdgeRepository';
export { MissionClarityRepository } from './repositories/MissionClarityRepository';
export { NativeToolApiKeyRepository } from './repositories/NativeToolApiKeyRepository';
export { AgentTemplateRepository } from './repositories/AgentTemplateRepository';
export { WorkflowRepository } from './repositories/WorkflowRepository';
export { SessionRepository } from './repositories/SessionRepository';
export { MemoryRepository } from './repositories/MemoryRepository';
export { MessageRepository } from './repositories/MessageRepository';
export { WaitlistRepository } from './repositories/WaitlistRepository';

// ============================================================================
// LOGGING & MONITORING
// ============================================================================

/**
 * Structured logging and performance monitoring utilities
 * @see {@link ./helpers/logging} for comprehensive logging capabilities
 */
export {
  Logger,
  PerformanceMonitor,
  HealthMonitor,
  RequestContext,
  logger,
} from './helpers/logging';

/**
 * Type definitions for logging and monitoring
 */
export type {
  LogLevel,
  LogContext,
  PerformanceMetrics,
  HealthStatus
} from './helpers/logging';

// ============================================================================
// MANAGEMENT SCRIPTS
// ============================================================================

/**
 * Database management and utility scripts
 * @see {@link ./scripts} for available management operations
 */
export { seedWaitlist } from './scripts/seed-waitlist';
export { migrationRunner } from './scripts/migration-runner';
