/**
 * Validation Types
 * 
 * Types related to workflow validation and error reporting
 */

/**
 * Workflow validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
  severity: 'error' | 'warning';
  details?: unknown;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  code: ValidationWarningCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
  suggestion?: string;
}

/**
 * Validation suggestion details
 */
export interface ValidationSuggestion {
  type: 'optimization' | 'improvement' | 'best_practice';
  message: string;
  impact: 'low' | 'medium' | 'high';
  nodeId?: string;
}

/**
 * Validation error codes
 */
export type ValidationErrorCode =
  | 'MISSING_START_NODE'
  | 'MISSING_END_NODE'
  | 'UNREACHABLE_NODE'
  | 'CIRCULAR_DEPENDENCY'
  | 'INVALID_NODE_TYPE'
  | 'INVALID_PARAMETERS'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_EDGE_CONNECTION'
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_EDGE_ID'
  | 'EXCEEDS_MAX_NODES'
  | 'EXCEEDS_MAX_EDGES'
  | 'INVALID_JSONATA_EXPRESSION'
  | 'VALIDATION_FAILED';

/**
 * Validation warning codes
 */
export type ValidationWarningCode = 
  | 'LONG_EXECUTION_PATH'
  | 'NO_ERROR_HANDLING'
  | 'MISSING_DESCRIPTIONS'
  | 'UNBALANCED_WORKLOAD'
  | 'NO_QUALITY_GATES'
  | 'POTENTIAL_TIMEOUT'
  | 'COMPLEX_CONDITIONALS'
  | 'LARGE_WORKFLOW_SIZE';