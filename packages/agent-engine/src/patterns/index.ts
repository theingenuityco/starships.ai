/**
 * MCP Tool Usage Patterns
 * 
 * Export all pattern implementations and utilities for agent MCP tool usage
 */

// Memory patterns
export {
  MCPMemoryPattern,
  AgentMemoryPatterns,
  createMemoryTools
} from './memory-integration-pattern';

export type {
  MemoryContext,
  MemoryPattern
} from './memory-integration-pattern';

// Web automation patterns
export {
  MCPWebAutomationPattern,
  WebAutomationPatterns,
  createWebAutomationTools
} from './web-automation-pattern';

export type {
  WebNavigationOptions,
  ScreenshotOptions,
  WebAutomationPattern
} from './web-automation-pattern';

// Combined pattern utilities
export { createCombinedMCPTools } from './combined-patterns';

// Pattern types
export type { PatternExample, UsageScenario } from './types';