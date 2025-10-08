/**
 * Error Types for Starships.ai
 *
 * Contains only error types and enums needed across the platform.
 * These types are imported and used by the error package implementations.
 */

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  DATABASE = 'database',
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  INTERNAL = 'internal',
}

/**
 * Standard error codes used across the Starships.ai platform
 */
export type StandardErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_INPUT'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FORMAT'
  | 'INVALID_RANGE'
  | 'INVALID_TYPE'
  | 'INVALID_STATUS_TRANSITION'
  | 'OPERATION_NOT_ALLOWED'
  | 'MESSAGE_INVALID_TYPE'
  | 'RESULT_VALIDATION_FAILED'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'ACCESS_DENIED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'FORBIDDEN_OPERATION'
  | 'STARSHIP_ACCESS_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'STARSHIP_NOT_FOUND'
  | 'AGENT_NOT_FOUND'
  | 'MESSAGE_NOT_FOUND'
  | 'RESULT_NOT_FOUND'
  | 'RESOURCE_ALREADY_EXISTS'
  | 'RESOURCE_CONFLICT'
  | 'AGENT_ALREADY_DEPLOYED'
  | 'RESOURCE_LOCKED'
  | 'STARSHIP_MAINTENANCE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'CONCURRENT_LIMIT_EXCEEDED'
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_SERVER_ERROR'
  | 'DATABASE_ERROR'
  | 'DATABASE_CONNECTION_FAILED'
  | 'DATABASE_QUERY_FAILED'
  | 'DATABASE_CONSTRAINT_VIOLATION'
  | 'DATABASE_TRANSACTION_FAILED'
  | 'STARSHIP_VALIDATION_FAILED'
  | 'AGENT_DEPLOYMENT_FAILED'
  | 'MESSAGE_SEND_FAILED'
  | 'RESULT_QUALITY_ASSESSMENT_FAILED'
  | 'CREATE_FAILED'
  | 'UPDATE_FAILED'
  | 'DELETE_FAILED'
  | 'STATUS_UPDATE_FAILED'
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'CONNECTION_FAILED'
  | 'SERVICE_UNREACHABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'AGENT_NOT_AVAILABLE'
  | 'TIMEOUT_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'DATABASE_TIMEOUT'
  | 'OPERATION_TIMEOUT'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'STARSHIP_CAPACITY_EXCEEDED'
  | 'RESOURCE_EXPIRED'
  | 'AGENT_NOT_QUALIFIED'
  | 'REQUIRED_FIELD_MISSING'
  | 'INVALID_VALUE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_TOKEN'
  | 'RESOURCE_CONSTRAINT_VIOLATION'
  | 'BUSINESS_RULE_VIOLATION'
  | 'OAUTH_STATE_INVALID'
  | 'OAUTH_PROVIDER_ERROR'
  | 'OAUTH_CALLBACK_ERROR'
  | 'OAUTH_TOKEN_INVALID'
  | 'OAUTH_EMAIL_MISMATCH'
  | 'OAUTH_ACCOUNT_LINKING_FAILED';

/**
 * Base error interface
 */
export interface ErrorDetails {
  code: StandardErrorCode;
  message: string;
  details?: unknown;
  timestamp: string;
  requestId?: string;
  path?: string;
  statusCode: number;
  category: ErrorCategory;
  field?: string;
  entityType?: string;
  entityId?: string;
}
