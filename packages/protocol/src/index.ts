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

export type AgentCategory = TemplateCategory;
export type ToolCategory = TemplateCategory;
/* Export domain types (database domains) */
export * from './domains/agent';
export * from './domains/agent-dispatch';
export * from './domains/auth';
export * from './domains/starship';
export * from './domains/system-env';
export * from './domains/platform-secret';
export * from './domains/user';
export * from './domains/task-board';
export * from './domains/table';
export * from './domains/doc';
export * from './domains/room';

// Export API contracts
export * from './contracts/api-response';
export * from './contracts/errors';
