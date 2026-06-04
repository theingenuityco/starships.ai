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
export * from './domains/llm';
export * from './domains/workflow';
export * from './domains/agent';
export * from './domains/attachment';
export * from './domains/auth';
export * from './domains/channel';
export * from './domains/conversation';
export * from './domains/conversation-state';
export * from './domains/conversation-read-state';
export * from './domains/direct-message';
export * from './domains/message-mention';
export * from './domains/message';
export * from './domains/notification';
export * from './domains/starship';
export * from './domains/connector-secrets';
export * from './domains/system-env';
export * from './domains/platform-secret';
export * from './domains/connector';
export * from './domains/autopilot-await';
export * from './domains/tool-call-approval';
export * from './domains/user';
export * from './domains/usage';
export * from './domains/llm-model';
export * from './domains/marketing-content';
export * from './domains/openrouter';
export * from './domains/schedule';
export * from './domains/heartbeat';
export * from './domains/task-board';
export * from './domains/table';
export * from './domains/doc';
export * from './domains/widget';
export * from './domains/view';
export * from './domains/room';

// Export API contracts
export * from './contracts/api-response';
export * from './contracts/errors';
export * from './contracts/conversation-stream';
export * from './contracts/import-export';
