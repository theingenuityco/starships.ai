// Database connections and utilities
export { createConnection, getConnection, PostgresConnection } from './helpers/database';
export type { PostgresConfig } from './helpers/database';

/* Entity exports */
export { AgentEntity } from './entities/AgentEntity';
export { AgentTemplateEntity } from './entities/AgentTemplateEntity';
export { ConversationEntity } from './entities/ConversationEntity';
export { ConnectorSecretEntity } from './entities/ConnectorSecretEntity';
export { PlatformSecretEntity } from './entities/PlatformSecretEntity';
export { ConnectorEntity } from './entities/ConnectorEntity';
export { ConnectorTemplateEntity } from './entities/ConnectorTemplateEntity';
export { MessageEntity } from './entities/MessageEntity';
export { OAuthAccountEntity } from './entities/OAuthAccountEntity';
export { OAuthAuthCodeEntity } from './entities/OAuthAuthCodeEntity';
export { EmailVerificationTokenEntity } from './entities/EmailVerificationTokenEntity';
export { PasswordResetTokenEntity } from './entities/PasswordResetTokenEntity';
export { EmailChangeTokenEntity } from './entities/EmailChangeTokenEntity';
export { StarshipEntity } from './entities/StarshipEntity';
export { ToolEntity } from './entities/ToolEntity';
export { ToolTemplateEntity } from './entities/ToolTemplateEntity';
export { UserEntity } from './entities/UserEntity';
export { UsageEntity } from './entities/UsageEntity';
export { WalletEntity } from './entities/WalletEntity';
export { TopupEntity } from './entities/TopupEntity';
export { LedgerEntryEntity } from './entities/LedgerEntryEntity';
export { PromoRedemptionEntity } from './entities/PromoRedemptionEntity';
export { WidgetEntity } from './entities/WidgetEntity';
export { ScheduleEntity } from './entities/ScheduleEntity';

/* Repository exports */
export { AgentRepository } from './repositories/AgentRepository';
export { AgentTemplateRepository } from './repositories/AgentTemplateRepository';
export { AttachmentRepository } from './repositories/AttachmentRepository';
export { ConversationRepository } from './repositories/ConversationRepository';
export { ConnectorSecretRepository } from './repositories/ConnectorSecretRepository';
export { PlatformSecretRepository } from './repositories/PlatformSecretRepository';
export { ConnectorTemplateRepository } from './repositories/ConnectorTemplateRepository';
export { ConnectorRepository } from './repositories/ConnectorRepository';
export { MessageRepository } from './repositories/MessageRepository';
export { OAuthAccountRepository } from './repositories/OAuthAccountRepository';
export { OAuthAuthCodeRepository } from './repositories/OAuthAuthCodeRepository';
export { EmailVerificationTokenRepository } from './repositories/EmailVerificationTokenRepository';
export { PasswordResetTokenRepository } from './repositories/PasswordResetTokenRepository';
export { EmailChangeTokenRepository } from './repositories/EmailChangeTokenRepository';
export { StarshipRepository } from './repositories/StarshipRepository';
export { ToolRepository } from './repositories/ToolRepository';
export { ToolTemplateRepository } from './repositories/ToolTemplateRepository';
export { UsageRepository } from './repositories/UsageRepository';
export { UserRepository } from './repositories/UserRepository';
export { WalletRepository } from './repositories/WalletRepository';
export { TopupRepository } from './repositories/TopupRepository';
export { LedgerRepository } from './repositories/LedgerRepository';
export { PromoRedemptionRepository } from './repositories/PromoRedemptionRepository';
export { WidgetRepository } from './repositories/WidgetRepository';
export { ScheduleRepository } from './repositories/ScheduleRepository';

// Logging and monitoring
export { HealthMonitor, Logger, logger, PerformanceMonitor, RequestContext } from './helpers/logging';

export type { HealthStatus, LogContext, LogLevel, PerformanceMetrics } from './helpers/logging';

/* Management scripts */
export { migrationRunner } from './scripts/migration-runner';
export { seedToolTemplates } from './scripts/seed-tool-templates';
export { seedAgentTemplates } from './scripts/seed-agent-templates';
export { seedUpdateDeployedInstances } from './scripts/seed-update-deployed-instances';
export { migrateDocTools } from './scripts/migrate-doc-tools';

// Utilities
export { generateRandomSuffix, generateUniqueAgentSlug, generateSimpleAgentSlug } from './utils/slugGenerator';

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
