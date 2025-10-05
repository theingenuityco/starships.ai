// Database connections and utilities
export { createConnection, getConnection, PostgresConnection } from './helpers/database';
export type { PostgresConfig } from './helpers/database';

/* Entity exports */
export { AgentEntity } from './entities/AgentEntity';
export { AgentTemplateEntity } from './entities/AgentTemplateEntity';
export { ConversationEntity } from './entities/ConversationEntity';
export { EnvironmentEntity } from './entities/EnvironmentEntity';
export { MessageEntity } from './entities/MessageEntity';
export { OAuthAccountEntity } from './entities/OAuthAccountEntity';
export { StarshipEntity } from './entities/StarshipEntity';
export { ToolEntity } from './entities/ToolEntity';
export { ToolTemplateEntity } from './entities/ToolTemplateEntity';
export { UserEntity } from './entities/UserEntity';
export { UsageEntity } from './entities/UsageEntity';

/* Repository exports */
export { AgentRepository } from './repositories/AgentRepository';
export { AgentTemplateRepository } from './repositories/AgentTemplateRepository';
export { ConversationRepository } from './repositories/ConversationRepository';
export { EnvironmentRepository } from './repositories/EnvironmentRepository';
export { MessageRepository } from './repositories/MessageRepository';
export { OAuthAccountRepository } from './repositories/OAuthAccountRepository';
export { StarshipRepository } from './repositories/StarshipRepository';
export { ToolRepository } from './repositories/ToolRepository';
export { ToolTemplateRepository } from './repositories/ToolTemplateRepository';
export { UsageRepository } from './repositories/UsageRepository';
export { UserRepository } from './repositories/UserRepository';
export { WaitlistRepository } from './repositories/WaitlistRepository';

// Logging and monitoring
export { HealthMonitor, Logger, logger, PerformanceMonitor, RequestContext } from './helpers/logging';

export type { HealthStatus, LogContext, LogLevel, PerformanceMetrics } from './helpers/logging';

/* Management scripts */
export { migrationRunner } from './scripts/migration-runner';
export { seedToolTemplates } from './scripts/seed-tool-templates';
export { seedAgentTemplates } from './scripts/seed-agent-templates';
export { seedWaitlist } from './scripts/seed-waitlist';
