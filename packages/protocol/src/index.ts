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
export * from './domains/attachment';
export * from './domains/auth';
export * from './domains/conversation';
export * from './domains/conversation-state';
export * from './domains/message';
export * from './domains/starship';
export * from './domains/connector-secrets';
export * from './domains/system-env';
export * from './domains/platform-secret';
export * from './domains/connector';
export * from './domains/tool';
export * from './domains/tool-call-approval';
export * from './domains/user';
export * from './domains/usage';
export * from './domains/wallet';
export * from './domains/topup';
export * from './domains/ledger';
export * from './domains/openrouter';
export * from './domains/promo';
export * from './domains/schedule';
export * from './domains/widget';

// Export API contracts
export * from './contracts/api-response';
export * from './contracts/errors';
export * from './contracts/conversation-stream';
export * from './contracts/import-export';
