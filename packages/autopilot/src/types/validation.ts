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
  errors?: ValidationError[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  nodeRef?: string;
  edgeRef?: string;
  details?: unknown;
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
  | 'VALIDATION_FAILED'
  | 'FORBIDDEN_FUNCTION'
  | 'INVALID_CONTEXT_ACCESS';
