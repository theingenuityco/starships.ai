// Database connections and utilities
export { createConnection, getConnection, createAgentConnection, getAgentConnection, PostgresConnection } from './helpers/database';
export type { PostgresConfig } from './helpers/database';

/* Entity exports */
export { AgentEntity } from './entities/AgentEntity';
export { PlatformSecretEntity } from './entities/PlatformSecretEntity';
export { RoomEntity } from './entities/RoomEntity';
export { OAuthAccountEntity } from './entities/OAuthAccountEntity';
export { OAuthAuthCodeEntity } from './entities/OAuthAuthCodeEntity';
export { EmailVerificationTokenEntity } from './entities/EmailVerificationTokenEntity';
export { PasswordResetTokenEntity } from './entities/PasswordResetTokenEntity';
export { EmailChangeTokenEntity } from './entities/EmailChangeTokenEntity';
export { StarshipMemberEntity } from './entities/StarshipMemberEntity';
export { StarshipInviteTokenEntity } from './entities/StarshipInviteTokenEntity';
export { StarshipEntity } from './entities/StarshipEntity';
export { UserEntity } from './entities/UserEntity';
export { TaskBoardEntity } from './entities/TaskBoardEntity';
export { TaskColumnEntity } from './entities/TaskColumnEntity';
export { TaskCardEntity } from './entities/TaskCardEntity';
export { StarshipDocEntity } from './entities/StarshipDocEntity';
// Turns

/* Repository exports */
export { AgentRepository } from './repositories/AgentRepository';
export { AgentTokenRepository } from './repositories/AgentTokenRepository';
export { AgentDeviceRepository } from './repositories/AgentDeviceRepository';
export { AgentDispatchRepository } from './repositories/AgentDispatchRepository';
export { AgentEventRepository } from './repositories/AgentEventRepository';
export { PlatformSecretRepository } from './repositories/PlatformSecretRepository';
export { RoomRepository } from './repositories/RoomRepository';
export { RoomTablesRepository } from './repositories/RoomTablesRepository';
export { RoomDocsRepository } from './repositories/RoomDocsRepository';
export { RoomTaskBoardsRepository } from './repositories/RoomTaskBoardsRepository';
export { OAuthAccountRepository } from './repositories/OAuthAccountRepository';
export { OAuthAuthCodeRepository } from './repositories/OAuthAuthCodeRepository';
export { EmailVerificationTokenRepository } from './repositories/EmailVerificationTokenRepository';
export { PasswordResetTokenRepository } from './repositories/PasswordResetTokenRepository';
export { EmailChangeTokenRepository } from './repositories/EmailChangeTokenRepository';
export { StarshipMemberRepository } from './repositories/StarshipMemberRepository';
export { StarshipInviteTokenRepository } from './repositories/StarshipInviteTokenRepository';
export { StarshipRepository } from './repositories/StarshipRepository';
export { UserRepository } from './repositories/UserRepository';
export { TaskBoardRepository } from './repositories/TaskBoardRepository';
export { TaskColumnRepository } from './repositories/TaskColumnRepository';
export { TaskCardRepository } from './repositories/TaskCardRepository';
export { StarshipDocRepository } from './repositories/StarshipDocRepository';
// Per-starship Database of Tables (replaces the removed JSONB Table repos).
export { StarshipTableRepository } from './repositories/StarshipTableRepository';
export type { StarshipTableRecord, CreateStarshipTableInput, UpdateStarshipTableInput } from './repositories/StarshipTableRepository';
export { StarshipTableRowRepository } from './repositories/StarshipTableRowRepository';
export type { TableRef, TableRowModel, TableRowFilter, TableRowFilterOp } from './repositories/StarshipTableRowRepository';

// Logging and monitoring
export { HealthMonitor, Logger, logger, PerformanceMonitor, RequestContext } from './helpers/logging';

export type { HealthStatus, LogContext, LogLevel, PerformanceMetrics } from './helpers/logging';

/* Management scripts */
export { migrationRunner } from './scripts/migration-runner';

/* Starship Database (per-starship schema of Tables) */
export { StarshipDatabaseProvisioner } from './services/StarshipDatabaseProvisioner';

/* Starship Definition Volume (filesystem-authoritative definition plane) */
export {
  schemaName as starshipSchemaName,
  roleName as starshipRoleName,
  qualifiedTable as starshipQualifiedTable,
  quoteIdent as quoteSqlIdent,
  assertSafeId as assertSafeStarshipId,
  sanitizeTableName,
  constraintName as tableConstraintName,
} from './helpers/starship-tables/identifiers';
export {
  compileCreateTable,
  compileAlterTable,
  pgTypeFor,
  TableSchemaChangeError,
  HIDDEN_COLUMNS,
  type CompileTableArgs,
  type CompileAlterArgs,
} from './services/StarshipTableDdlCompiler';
export {
  buildColumnsIntrospectionSql,
  physicalUserColumns,
  reassembleColumns,
  type IntrospectedColumn,
} from './helpers/starship-tables/introspection';

// Utilities
export { generateRandomSuffix, generateUniqueAgentSlug, generateSimpleAgentSlug } from './utils/slugGenerator';
export { computeAgentContentHash, computeToolContentHash, sha256Hex, stableStringify } from './utils/contentHash';

// Shared agent defaults
export {
  MIN_AGENT_TEMPERATURE,
  MAX_AGENT_TEMPERATURE,
  DEFAULT_AGENT_TEMPERATURE,
  MIN_AGENT_MAX_TOKENS,
  MAX_AGENT_MAX_TOKENS,
  DEFAULT_AGENT_MAX_TOKENS,
  MIN_AGENT_TIMEOUT_MS,
  MAX_AGENT_TIMEOUT_MS,
  DEFAULT_AGENT_TIMEOUT_MS,
} from './constants/agentDefaults';
