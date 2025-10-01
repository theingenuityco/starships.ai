// ============================================================================
// MAIN PROTOCOL EXPORTS
// ============================================================================

// ============================================================================
// SHARED TEMPLATE TYPES
// ============================================================================

/**
 * Unified template category options (shared between agent and tool templates)
 */
export type TemplateCategory =
  | 'general'
  | 'coding'
  | 'creative'
  | 'analysis'
  | 'support'
  | 'utility'
  | 'data'
  | 'communication'
  | 'automation';
/* Export domain types (database domains) */
export * from './domains/agent';
export * from './domains/agent-template';
export * from './domains/auth';
export * from './domains/blueprint';
export * from './domains/conversation';
export * from './domains/edge';
export * from './domains/execution';
export * from './domains/message';
export * from './domains/node';
export * from './domains/starship';
export * from './domains/environment';
export * from './domains/tool';
export * from './domains/user';
export * from './domains/waitlist';
export * from './domains/workflow';
export * from './domains/usage';
export * from './domains/openrouter';

// Export API contracts
export * from './contracts/api-response';
export * from './contracts/errors';
export * from './contracts/streaming';
