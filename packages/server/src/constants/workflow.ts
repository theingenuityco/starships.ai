/**
 * Workflow DSL Configuration Constants
 * 
 * These constants define the operational limits and timeouts for the workflow system.
 */

export const WORKFLOW_CONFIG = {
  // User approval timeout for workflow DSL approval
  APPROVAL_TIMEOUT_MINUTES: 30,
  
  // Maximum depth of conditional nesting to prevent infinite loops
  MAX_CONDITIONAL_DEPTH: 10,
  
  // Timeout for user prompt responses during workflow execution
  USER_PROMPT_TIMEOUT_MINUTES: 60,
  
  // JSONata expression evaluation timeout to prevent hanging
  JSONATA_EXPRESSION_TIMEOUT_MS: 5000,
  
  // Maximum number of nodes in a workflow to prevent performance issues
  MAX_WORKFLOW_NODES: 50,
  
  // Maximum number of edges in a workflow to prevent performance issues
  MAX_WORKFLOW_EDGES: 100
} as const;

export type WorkflowConfigKey = keyof typeof WORKFLOW_CONFIG;