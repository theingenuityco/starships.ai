// Connection
export { createConnection, getConnection, Neo4jConnection } from './connection';
export type { Neo4jConfig } from './connection';

// Types (interfaces only)
export * from './types';

// Repository implementations
export { AgentRepository } from './repositories/AgentRepository';
export { UserRepository } from './repositories/UserRepository';
export { ChannelRepository } from './repositories/ChannelRepository';
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
