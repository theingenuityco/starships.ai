/**
 * Workflow Configuration Constants
 *
 * Operational limits and timeouts for the workflow system
 */

export const config = {
  // User approval timeout for workflow DSL approval
  APPROVAL_TIMEOUT: 30 * 60 * 1000, // 30 minutes in ms

  // Execution timeout for single workflow execution
  EXECUTION_TIMEOUT: 60 * 60 * 1000, // 1 hour in ms

  // Timeout for user prompt responses during workflow execution
  USER_PROMPT_TIMEOUT: 60 * 60 * 1000, // 1 hour in ms

  // Agent execution timeout
  AGENT_EXECUTION_TIMEOUT: 10 * 60 * 1000, // 10 minutes in ms

  // Maximum number of nodes in a workflow to prevent performance issues
  MAX_NODES: 50,

  // Maximum number of edges in a workflow to prevent performance issues
  MAX_EDGES: 100,

  // Default retry configuration
  DEFAULT_RETRIES: 3,
  RETRY_BACKOFF_MS: 1000,

  // JSONata expression evaluation timeout to prevent hanging
  JSONATA_EXPRESSION_TIMEOUT_MS: 5000,

  // Maximum depth of conditional nesting to prevent infinite loops
  MAX_CONDITIONAL_DEPTH: 10,

  // Maximum visits per node to prevent infinite cycles
  MAX_NODE_VISITS: 3,
} as const;

export type ConfigKey = keyof typeof config;
