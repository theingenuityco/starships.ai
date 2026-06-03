// Database connections and utilities
export { createConnection, getConnection, createAgentConnection, getAgentConnection, PostgresConnection } from './helpers/database';
export type { PostgresConfig } from './helpers/database';

/* Entity exports */
export { AgentEntity } from './entities/AgentEntity';
export { ConversationEntity } from './entities/ConversationEntity';
export { ConnectorSecretEntity } from './entities/ConnectorSecretEntity';
export { PlatformSecretEntity } from './entities/PlatformSecretEntity';
export { ConnectorEntity } from './entities/ConnectorEntity';
export { ConnectorTemplateEntity } from './entities/ConnectorTemplateEntity';
export { ConnectorEventEntity } from './entities/ConnectorEventEntity';
export { ConnectorWebhookBindingEntity } from './entities/ConnectorWebhookBindingEntity';
export { ChannelEntity } from './entities/ChannelEntity';
export { RoomEntity } from './entities/RoomEntity';
export { ConversationReadStateEntity } from './entities/ConversationReadStateEntity';
export { DirectMessageEntity } from './entities/DirectMessageEntity';
export { MessageEntity } from './entities/MessageEntity';
export { MessageMentionEntity } from './entities/MessageMentionEntity';
export { NotificationEntity } from './entities/NotificationEntity';
export { OAuthAccountEntity } from './entities/OAuthAccountEntity';
export { OAuthAuthCodeEntity } from './entities/OAuthAuthCodeEntity';
export { EmailVerificationTokenEntity } from './entities/EmailVerificationTokenEntity';
export { PasswordResetTokenEntity } from './entities/PasswordResetTokenEntity';
export { EmailChangeTokenEntity } from './entities/EmailChangeTokenEntity';
export { StarshipMemberEntity } from './entities/StarshipMemberEntity';
export { StarshipInviteTokenEntity } from './entities/StarshipInviteTokenEntity';
export { ConversationParticipantEntity } from './entities/ConversationParticipantEntity';
export { ConversationNotificationPrefEntity } from './entities/ConversationNotificationPrefEntity';
export { StarshipEntity } from './entities/StarshipEntity';
export { ToolEntity } from './entities/ToolEntity';
export { UserEntity } from './entities/UserEntity';
export { UsageEntity } from './entities/UsageEntity';
export { WidgetEntity } from './entities/WidgetEntity';
export { ViewEntity } from './entities/ViewEntity';
export { ScheduleEntity } from './entities/ScheduleEntity';
export { TaskBoardEntity } from './entities/TaskBoardEntity';
export { TaskColumnEntity } from './entities/TaskColumnEntity';
export { TaskCardEntity } from './entities/TaskCardEntity';
export { StarshipDocEntity } from './entities/StarshipDocEntity';
export { ToolCallApprovalEntity } from './entities/ToolCallApprovalEntity';
export { MarketingContentEntity } from './entities/MarketingContentEntity';
export { AutopilotAwaitEntity } from './entities/AutopilotAwaitEntity';
export { AutopilotAwaitFiringEntity } from './entities/AutopilotAwaitFiringEntity';
// Turns

/* Repository exports */
export { AgentRepository } from './repositories/AgentRepository';
export { AttachmentRepository } from './repositories/AttachmentRepository';
export { ConversationRepository } from './repositories/ConversationRepository';
export { ConnectorSecretRepository } from './repositories/ConnectorSecretRepository';
export { PlatformSecretRepository } from './repositories/PlatformSecretRepository';
export { ConnectorTemplateRepository } from './repositories/ConnectorTemplateRepository';
export { ConnectorTemplateActionRepository } from './repositories/ConnectorTemplateActionRepository';
export { ConnectorRepository } from './repositories/ConnectorRepository';
export { ConnectorEventRepository } from './repositories/ConnectorEventRepository';
export { ConnectorWebhookBindingRepository } from './repositories/ConnectorWebhookBindingRepository';
export { ChannelRepository } from './repositories/ChannelRepository';
export { RoomRepository } from './repositories/RoomRepository';
export { RoomViewsRepository } from './repositories/RoomViewsRepository';
export { RoomTablesRepository } from './repositories/RoomTablesRepository';
export { RoomDocsRepository } from './repositories/RoomDocsRepository';
export { RoomTaskBoardsRepository } from './repositories/RoomTaskBoardsRepository';
export { RoomToolsRepository } from './repositories/RoomToolsRepository';
export { ConversationReadStateRepository } from './repositories/ConversationReadStateRepository';
export { DirectMessageRepository } from './repositories/DirectMessageRepository';
export { MessageRepository } from './repositories/MessageRepository';
export { MessageReactionRepository } from './repositories/MessageReactionRepository';
export { MessageMentionRepository } from './repositories/MessageMentionRepository';
export { NotificationRepository } from './repositories/NotificationRepository';
export { OAuthAccountRepository } from './repositories/OAuthAccountRepository';
export { OAuthAuthCodeRepository } from './repositories/OAuthAuthCodeRepository';
export { EmailVerificationTokenRepository } from './repositories/EmailVerificationTokenRepository';
export { PasswordResetTokenRepository } from './repositories/PasswordResetTokenRepository';
export { EmailChangeTokenRepository } from './repositories/EmailChangeTokenRepository';
export { StarshipMemberRepository } from './repositories/StarshipMemberRepository';
export { StarshipInviteTokenRepository } from './repositories/StarshipInviteTokenRepository';
export { ConversationParticipantRepository } from './repositories/ConversationParticipantRepository';
export { ConversationNotificationPrefRepository } from './repositories/ConversationNotificationPrefRepository';
export { StarshipRepository } from './repositories/StarshipRepository';
export { ToolRepository } from './repositories/ToolRepository';
export { UsageRepository } from './repositories/UsageRepository';
export { UserRepository } from './repositories/UserRepository';
export { WidgetRepository } from './repositories/WidgetRepository';
export { ViewRepository } from './repositories/ViewRepository';
export { ViewWidgetRepository } from './repositories/ViewWidgetRepository';
export { ScheduleRepository } from './repositories/ScheduleRepository';
export { TaskBoardRepository } from './repositories/TaskBoardRepository';
export { TaskColumnRepository } from './repositories/TaskColumnRepository';
export { TaskCardRepository } from './repositories/TaskCardRepository';
export { StarshipDocRepository } from './repositories/StarshipDocRepository';
// Per-starship Database of Tables (replaces the removed JSONB Table repos).
export { StarshipTableRepository } from './repositories/StarshipTableRepository';
export type { StarshipTableRecord, CreateStarshipTableInput, UpdateStarshipTableInput } from './repositories/StarshipTableRepository';
export { StarshipTableRowRepository } from './repositories/StarshipTableRowRepository';
export type { TableRef, TableRowModel, TableRowFilter, TableRowFilterOp } from './repositories/StarshipTableRowRepository';
export { AutopilotAwaitRepository } from './repositories/AutopilotAwaitRepository';
export { AutopilotAwaitFiringRepository } from './repositories/AutopilotAwaitFiringRepository';
export { ToolCallApprovalRepository } from './repositories/ToolCallApprovalRepository';
export { TurnRepository } from './repositories/TurnRepository';
export { LlmModelRepository } from './repositories/LlmModelRepository';
export { MarketingContentRepository } from './repositories/MarketingContentRepository';
export { HeartbeatConfigRepository } from './repositories/HeartbeatConfigRepository';
export { HeartbeatRunRepository } from './repositories/HeartbeatRunRepository';

// Logging and monitoring
export { HealthMonitor, Logger, logger, PerformanceMonitor, RequestContext } from './helpers/logging';

export type { HealthStatus, LogContext, LogLevel, PerformanceMetrics } from './helpers/logging';

/* Management scripts */
export { migrationRunner } from './scripts/migration-runner';

/* Starship Database (per-starship schema of Tables) */
export { StarshipDatabaseProvisioner } from './services/StarshipDatabaseProvisioner';
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
export { extractRequiredConnectorProviders } from './utils/extractRequiredConnectorProviders';
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
