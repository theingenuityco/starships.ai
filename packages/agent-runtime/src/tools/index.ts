// Public surface of the tool framework. The runtime builds a ToolRegistry, registers
// providers (system today; mcp / user bundles next), and resolves every call through it.
export { ToolRegistry, toWireName } from './registry';
export { buildSystemProvider, SystemProvider } from './system';
export { buildMcpProvider, McpProvider } from './mcp/provider';
export { buildBundleProvider, BundleProvider } from './bundle/provider';
export { createToolsetMcpServer } from './expose/server';
export type {
  Capability,
  ToolContext,
  ToolResult,
  JSONSchema,
  ToolSchema,
  ToolDescriptor,
  ProviderInitContext,
  ToolsetProvider,
} from './types';
