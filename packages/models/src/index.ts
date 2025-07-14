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
export { CodexRepository } from './repositories/CodexRepository';
export { VisionRepository } from './repositories/VisionRepository';
export { ConstraintRepository } from './repositories/ConstraintRepository';
export { ConceptRepository } from './repositories/ConceptRepository';
export { MetaAnchorRepository } from './repositories/MetaAnchorRepository';

// NEW: Agent Templates
export { Neo4jAgentTemplateRepository } from './repositories/AgentTemplateRepository';

// Factory for creating repositories
export { RepositoryFactory } from './repositories';

// NEW: Export AetherCoreService
export { AetherCoreService } from './services/AetherCoreService';

// NEW: Export AgentTemplateService
export { AgentTemplateService } from './services/AgentTemplateService';
