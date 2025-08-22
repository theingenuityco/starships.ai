/**
 * @deprecated This monolithic types.ts file is being replaced by domain-specific type files.
 * 
 * MIGRATION GUIDE:
 * 
 * This file now re-exports all types from the new domain-specific structure.
 * For better organization and type safety, prefer importing from specific domains:
 * 
 * OLD (still works):
 *   import { User, Starship, Agent } from '@starships/models/types'
 * 
 * NEW (preferred):
 *   import { User } from '@starships/models/types/user'
 *   import { Starship } from '@starships/models/types/starship'
 *   import { Agent } from '@starships/models/types/agent'
 * 
 * DOMAIN ORGANIZATION:
 * - User Identity Context: types/user.ts
 * - Starship Lifecycle Context: types/starship.ts  
 * - Agent Marketplace Context: types/agent.ts
 * - Connector Management Context: types/connector.ts
 * - Vision Statement Context: types/vision.ts
 * - Cross-domain Relationships: types/relationships.ts
 * - Shared Utilities: types/shared.ts
 * 
 * This file will be removed in a future version once all imports are migrated.
 */

// Re-export everything from the new domain-specific structure
export * from './types/index';

/**
 * DEPRECATION NOTICE:
 * 
 * The following import patterns will be removed in a future version:
 * 
 * import { User, Starship } from '@starships/models/types.ts' ❌ (this file)
 * 
 * Please update to use domain-specific imports:
 * 
 * import { User } from '@starships/models/types/user' ✅
 * import { Starship } from '@starships/models/types/starship' ✅
 * 
 * Or use the barrel export:
 * 
 * import { User, Starship } from '@starships/models/types' ✅
 * 
 * This provides better:
 * - Type safety and validation with Zod schemas
 * - Domain boundary clarity  
 * - Code organization and maintainability
 * - Tree-shaking and bundle optimization
 * - Aggregate root patterns and business rules
 */
