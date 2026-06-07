// Library surface for @starships/agent-runtime. The HTTP service is the primary entry
// (src/server.ts), but these exports let the runtime be embedded directly too.
export { runAgent } from './runtime';
export { validateKey } from './validate';
export { resolveModel, resolveApiKey } from './provider';
export { ToolRegistry, buildSystemProvider, toWireName } from './tools';
export type {
  Capability,
  ToolContext,
  ToolResult,
  JSONSchema,
  ToolSchema,
  ToolDescriptor,
  ProviderInitContext,
  ToolsetProvider,
} from './tools';
export * as translate from './translate';
export type {
  ProviderId,
  PermissionMode,
  ApprovalDecision,
  PermissionRequest,
  RunRequest,
  RuntimeHandlers,
} from './types';
