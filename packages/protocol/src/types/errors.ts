/**
 * Standardized Error Handling System
 * 
 * Provides comprehensive error types, classes, and utilities for consistent
 * error management across the entire system.
 */

// ============================================================================
// CORE ERROR TYPES AND ENUMS
// ============================================================================

/**
 * Error severity levels for logging and monitoring
 */
export type ErrorSeverity = 
  | 'low'       // Minor issues, warnings
  | 'medium'    // Standard errors, recoverable
  | 'high'      // Critical errors, may affect functionality
  | 'critical'; // System-level errors, requires immediate attention

/**
 * Error categories for classification and handling
 */
export type ErrorCategory = 
  | 'validation'    // Input validation errors
  | 'authentication' // Auth and permission errors
  | 'authorization' // Access control errors
  | 'not_found'     // Resource not found errors
  | 'conflict'      // Resource conflict errors
  | 'rate_limit'    // Rate limiting errors
  | 'external'      // External service errors
  | 'database'      // Database operation errors
  | 'network'       // Network connectivity errors
  | 'system'        // System-level errors
  | 'business'      // Business logic errors
  | 'unknown';      // Unclassified errors

/**
 * Comprehensive error codes for the system
 */
export type StandardErrorCode =
  // General System Errors
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT_ERROR'
  | 'CONFIGURATION_ERROR'
  
  // Validation Errors
  | 'VALIDATION_ERROR'
  | 'INVALID_INPUT'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FORMAT'
  | 'INVALID_RANGE'
  | 'INVALID_TYPE'
  
  // Authentication & Authorization
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'ACCESS_DENIED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'FORBIDDEN_OPERATION'
  
  // Resource Errors
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_ALREADY_EXISTS'
  | 'RESOURCE_CONFLICT'
  | 'RESOURCE_LOCKED'
  | 'RESOURCE_EXPIRED'
  | 'RESOURCE_LIMIT_EXCEEDED'
  
  // Database Errors
  | 'DATABASE_ERROR'
  | 'DATABASE_CONNECTION_FAILED'
  | 'DATABASE_QUERY_FAILED'
  | 'DATABASE_CONSTRAINT_VIOLATION'
  | 'DATABASE_TRANSACTION_FAILED'
  | 'DATABASE_TIMEOUT'
  
  // Network Errors
  | 'NETWORK_ERROR'
  | 'CONNECTION_FAILED'
  | 'REQUEST_TIMEOUT'
  | 'SERVICE_UNREACHABLE'
  
  // Rate Limiting
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'CONCURRENT_LIMIT_EXCEEDED'
  
  
  // Starship-Specific Errors
  | 'STARSHIP_NOT_FOUND'
  | 'STARSHIP_ACCESS_DENIED'
  | 'STARSHIP_MAINTENANCE'
  | 'STARSHIP_CAPACITY_EXCEEDED'
  | 'STARSHIP_VALIDATION_FAILED'
  
  // Task-Specific Errors
  | 'TASK_NOT_FOUND'
  | 'TASK_ALREADY_ASSIGNED'
  | 'TASK_CANNOT_ASSIGN'
  | 'TASK_CANNOT_COMPLETE'
  | 'TASK_CANNOT_DELETE'
  | 'TASK_DEPENDENCY_NOT_MET'
  
  // Agent-Specific Errors
  | 'AGENT_NOT_FOUND'
  | 'AGENT_NOT_AVAILABLE'
  | 'AGENT_NOT_QUALIFIED'
  | 'AGENT_ALREADY_DEPLOYED'
  | 'AGENT_DEPLOYMENT_FAILED'
  
  // Message-Specific Errors
  | 'MESSAGE_NOT_FOUND'
  | 'MESSAGE_SEND_FAILED'
  | 'MESSAGE_INVALID_TYPE'
  
  // Result-Specific Errors
  | 'RESULT_NOT_FOUND'
  | 'RESULT_VALIDATION_FAILED'
  | 'RESULT_QUALITY_ASSESSMENT_FAILED'
  
  // Operation-Specific Errors
  | 'CREATE_FAILED'
  | 'UPDATE_FAILED'
  | 'DELETE_FAILED'
  | 'STATUS_UPDATE_FAILED'
  | 'INVALID_STATUS_TRANSITION'
  | 'OPERATION_NOT_ALLOWED'
  | 'OPERATION_TIMEOUT';

// ============================================================================
// ERROR INTERFACES AND TYPES
// ============================================================================

/**
 * Core error information structure
 */
export interface ErrorInfo {
  code: StandardErrorCode;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  details?: Record<string, any>;
  context?: ErrorContext;
  timestamp: string;
  correlationId?: string;
  userId?: string;
  requestId?: string;
}

/**
 * Error context for debugging and monitoring
 */
export interface ErrorContext {
  service?: string;
  method?: string;
  resource?: string;
  resourceId?: string;
  operation?: string;
  stackTrace?: string;
  userAgent?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

/**
 * Error response format for API endpoints
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: StandardErrorCode;
    message: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    details?: Record<string, any>;
    timestamp: string;
    correlationId?: string;
    requestId?: string;
  };
  meta?: {
    version: string;
    environment: string;
    service: string;
  };
}

/**
 * Validation error details
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: any;
  constraint?: string;
}

/**
 * Database error details
 */
export interface DatabaseErrorDetail {
  query?: string;
  table?: string;
  constraint?: string;
  operation?: string;
  originalError?: string;
}

/**
 * Network error details
 */
export interface NetworkErrorDetail {
  url?: string;
  method?: string;
  statusCode?: number;
  timeout?: number;
  retryCount?: number;
}

// ============================================================================
// ERROR MAPPING AND CONFIGURATION
// ============================================================================

/**
 * HTTP status code mapping for error codes
 */
export const ERROR_HTTP_STATUS_MAP: Record<StandardErrorCode, number> = {
  // 400 Bad Request
  'VALIDATION_ERROR': 400,
  'INVALID_INPUT': 400,
  'MISSING_REQUIRED_FIELD': 400,
  'INVALID_FORMAT': 400,
  'INVALID_RANGE': 400,
  'INVALID_TYPE': 400,
  'TASK_CANNOT_ASSIGN': 400,
  'TASK_CANNOT_COMPLETE': 400,
  'TASK_CANNOT_DELETE': 400,
  'TASK_DEPENDENCY_NOT_MET': 400,
  'INVALID_STATUS_TRANSITION': 400,
  'OPERATION_NOT_ALLOWED': 400,
  'MESSAGE_INVALID_TYPE': 400,
  'RESULT_VALIDATION_FAILED': 400,
  
  // 401 Unauthorized
  'AUTHENTICATION_REQUIRED': 401,
  'AUTHENTICATION_FAILED': 401,
  'TOKEN_EXPIRED': 401,
  'TOKEN_INVALID': 401,
  
  // 403 Forbidden
  'ACCESS_DENIED': 403,
  'INSUFFICIENT_PERMISSIONS': 403,
  'FORBIDDEN_OPERATION': 403,
  'STARSHIP_ACCESS_DENIED': 403,
  
  // 404 Not Found
  'RESOURCE_NOT_FOUND': 404,
  'STARSHIP_NOT_FOUND': 404,
  'TASK_NOT_FOUND': 404,
  'AGENT_NOT_FOUND': 404,
  'MESSAGE_NOT_FOUND': 404,
  'RESULT_NOT_FOUND': 404,
  
  // 409 Conflict
  'RESOURCE_ALREADY_EXISTS': 409,
  'RESOURCE_CONFLICT': 409,
  'TASK_ALREADY_ASSIGNED': 409,
  'AGENT_ALREADY_DEPLOYED': 409,
  
  // 423 Locked
  'RESOURCE_LOCKED': 423,
  'STARSHIP_MAINTENANCE': 423,
  
  // 429 Too Many Requests
  'RATE_LIMIT_EXCEEDED': 429,
  'QUOTA_EXCEEDED': 429,
  'CONCURRENT_LIMIT_EXCEEDED': 429,
  
  // 500 Internal Server Error
  'UNKNOWN_ERROR': 500,
  'INTERNAL_SERVER_ERROR': 500,
  'DATABASE_ERROR': 500,
  'DATABASE_CONNECTION_FAILED': 500,
  'DATABASE_QUERY_FAILED': 500,
  'DATABASE_CONSTRAINT_VIOLATION': 500,
  'DATABASE_TRANSACTION_FAILED': 500,
  'STARSHIP_VALIDATION_FAILED': 500,
  'AGENT_DEPLOYMENT_FAILED': 500,
  'MESSAGE_SEND_FAILED': 500,
  'RESULT_QUALITY_ASSESSMENT_FAILED': 500,
  'CREATE_FAILED': 500,
  'UPDATE_FAILED': 500,
  'DELETE_FAILED': 500,
  'STATUS_UPDATE_FAILED': 500,
  'CONFIGURATION_ERROR': 500,
  
  // 502 Bad Gateway
  'NETWORK_ERROR': 502,
  'CONNECTION_FAILED': 502,
  'SERVICE_UNREACHABLE': 502,
  
  // 503 Service Unavailable
  'SERVICE_UNAVAILABLE': 503,
  'AGENT_NOT_AVAILABLE': 503,
  
  // 504 Gateway Timeout
  'TIMEOUT_ERROR': 504,
  'REQUEST_TIMEOUT': 504,
  'DATABASE_TIMEOUT': 504,
  'OPERATION_TIMEOUT': 504,
  
  // 507 Insufficient Storage
  'RESOURCE_LIMIT_EXCEEDED': 507,
  'STARSHIP_CAPACITY_EXCEEDED': 507,
  
  // 410 Gone
  'RESOURCE_EXPIRED': 410,
  
  // 422 Unprocessable Entity
  'AGENT_NOT_QUALIFIED': 422,
};

/**
 * Error category mapping for error codes
 */
export const ERROR_CATEGORY_MAP: Record<StandardErrorCode, ErrorCategory> = {
  // Validation errors
  'VALIDATION_ERROR': 'validation',
  'INVALID_INPUT': 'validation',
  'MISSING_REQUIRED_FIELD': 'validation',
  'INVALID_FORMAT': 'validation',
  'INVALID_RANGE': 'validation',
  'INVALID_TYPE': 'validation',
  'MESSAGE_INVALID_TYPE': 'validation',
  'RESULT_VALIDATION_FAILED': 'validation',
  
  // Authentication errors
  'AUTHENTICATION_REQUIRED': 'authentication',
  'AUTHENTICATION_FAILED': 'authentication',
  'TOKEN_EXPIRED': 'authentication',
  'TOKEN_INVALID': 'authentication',
  
  // Authorization errors
  'ACCESS_DENIED': 'authorization',
  'INSUFFICIENT_PERMISSIONS': 'authorization',
  'FORBIDDEN_OPERATION': 'authorization',
  'STARSHIP_ACCESS_DENIED': 'authorization',
  
  // Not found errors
  'RESOURCE_NOT_FOUND': 'not_found',
  'STARSHIP_NOT_FOUND': 'not_found',
  'TASK_NOT_FOUND': 'not_found',
  'AGENT_NOT_FOUND': 'not_found',
  'MESSAGE_NOT_FOUND': 'not_found',
  'RESULT_NOT_FOUND': 'not_found',
  
  // Conflict errors
  'RESOURCE_ALREADY_EXISTS': 'conflict',
  'RESOURCE_CONFLICT': 'conflict',
  'TASK_ALREADY_ASSIGNED': 'conflict',
  'AGENT_ALREADY_DEPLOYED': 'conflict',
  'RESOURCE_LOCKED': 'conflict',
  'STARSHIP_MAINTENANCE': 'conflict',
  
  // Rate limit errors
  'RATE_LIMIT_EXCEEDED': 'rate_limit',
  'QUOTA_EXCEEDED': 'rate_limit',
  'CONCURRENT_LIMIT_EXCEEDED': 'rate_limit',
  
  // Database errors
  'DATABASE_ERROR': 'database',
  'DATABASE_CONNECTION_FAILED': 'database',
  'DATABASE_QUERY_FAILED': 'database',
  'DATABASE_CONSTRAINT_VIOLATION': 'database',
  'DATABASE_TRANSACTION_FAILED': 'database',
  'DATABASE_TIMEOUT': 'database',
  
  // Network errors
  'NETWORK_ERROR': 'network',
  'CONNECTION_FAILED': 'network',
  'REQUEST_TIMEOUT': 'network',
  'SERVICE_UNREACHABLE': 'network',
  'TIMEOUT_ERROR': 'network',
  'OPERATION_TIMEOUT': 'network',
  
  // System errors
  'UNKNOWN_ERROR': 'system',
  'INTERNAL_SERVER_ERROR': 'system',
  'SERVICE_UNAVAILABLE': 'system',
  'CONFIGURATION_ERROR': 'system',
  
  // Business logic errors
  'TASK_CANNOT_ASSIGN': 'business',
  'TASK_CANNOT_COMPLETE': 'business',
  'TASK_CANNOT_DELETE': 'business',
  'TASK_DEPENDENCY_NOT_MET': 'business',
  'AGENT_NOT_QUALIFIED': 'business',
  'INVALID_STATUS_TRANSITION': 'business',
  'OPERATION_NOT_ALLOWED': 'business',
  'RESOURCE_LIMIT_EXCEEDED': 'business',
  'STARSHIP_CAPACITY_EXCEEDED': 'business',
  'RESOURCE_EXPIRED': 'business',
  'STARSHIP_VALIDATION_FAILED': 'business',
  'AGENT_DEPLOYMENT_FAILED': 'business',
  'MESSAGE_SEND_FAILED': 'business',
  'RESULT_QUALITY_ASSESSMENT_FAILED': 'business',
  'CREATE_FAILED': 'business',
  'UPDATE_FAILED': 'business',
  'DELETE_FAILED': 'business',
  'STATUS_UPDATE_FAILED': 'business',
  'AGENT_NOT_AVAILABLE': 'external',
};

/**
 * Error severity mapping for error codes
 */
export const ERROR_SEVERITY_MAP: Record<StandardErrorCode, ErrorSeverity> = {
  // Low severity
  'VALIDATION_ERROR': 'low',
  'INVALID_INPUT': 'low',
  'MISSING_REQUIRED_FIELD': 'low',
  'INVALID_FORMAT': 'low',
  'INVALID_RANGE': 'low',
  'INVALID_TYPE': 'low',
  'MESSAGE_INVALID_TYPE': 'low',
  'RESOURCE_NOT_FOUND': 'low',
  'STARSHIP_NOT_FOUND': 'low',
  'TASK_NOT_FOUND': 'low',
  'AGENT_NOT_FOUND': 'low',
  'MESSAGE_NOT_FOUND': 'low',
  'RESULT_NOT_FOUND': 'low',
  
  // Medium severity
  'AUTHENTICATION_REQUIRED': 'medium',
  'AUTHENTICATION_FAILED': 'medium',
  'ACCESS_DENIED': 'medium',
  'INSUFFICIENT_PERMISSIONS': 'medium',
  'FORBIDDEN_OPERATION': 'medium',
  'STARSHIP_ACCESS_DENIED': 'medium',
  'RESOURCE_ALREADY_EXISTS': 'medium',
  'RESOURCE_CONFLICT': 'medium',
  'TASK_ALREADY_ASSIGNED': 'medium',
  'AGENT_ALREADY_DEPLOYED': 'medium',
  'TASK_CANNOT_ASSIGN': 'medium',
  'TASK_CANNOT_COMPLETE': 'medium',
  'TASK_CANNOT_DELETE': 'medium',
  'INVALID_STATUS_TRANSITION': 'medium',
  'OPERATION_NOT_ALLOWED': 'medium',
  'RESULT_VALIDATION_FAILED': 'medium',
  'AGENT_NOT_QUALIFIED': 'medium',
  'RESOURCE_EXPIRED': 'medium',
  
  // High severity
  'TOKEN_EXPIRED': 'high',
  'TOKEN_INVALID': 'high',
  'RESOURCE_LOCKED': 'high',
  'STARSHIP_MAINTENANCE': 'high',
  'RATE_LIMIT_EXCEEDED': 'high',
  'QUOTA_EXCEEDED': 'high',
  'CONCURRENT_LIMIT_EXCEEDED': 'high',
  'TASK_DEPENDENCY_NOT_MET': 'high',
  'RESOURCE_LIMIT_EXCEEDED': 'high',
  'STARSHIP_CAPACITY_EXCEEDED': 'high',
  'NETWORK_ERROR': 'high',
  'CONNECTION_FAILED': 'high',
  'REQUEST_TIMEOUT': 'high',
  'SERVICE_UNREACHABLE': 'high',
  'TIMEOUT_ERROR': 'high',
  'OPERATION_TIMEOUT': 'high',
  'AGENT_NOT_AVAILABLE': 'high',
  
  // Critical severity
  'UNKNOWN_ERROR': 'critical',
  'INTERNAL_SERVER_ERROR': 'critical',
  'SERVICE_UNAVAILABLE': 'critical',
  'DATABASE_ERROR': 'critical',
  'DATABASE_CONNECTION_FAILED': 'critical',
  'DATABASE_QUERY_FAILED': 'critical',
  'DATABASE_CONSTRAINT_VIOLATION': 'critical',
  'DATABASE_TRANSACTION_FAILED': 'critical',
  'DATABASE_TIMEOUT': 'critical',
  'STARSHIP_VALIDATION_FAILED': 'critical',
  'AGENT_DEPLOYMENT_FAILED': 'critical',
  'MESSAGE_SEND_FAILED': 'critical',
  'RESULT_QUALITY_ASSESSMENT_FAILED': 'critical',
  'CREATE_FAILED': 'critical',
  'UPDATE_FAILED': 'critical',
  'DELETE_FAILED': 'critical',
  'STATUS_UPDATE_FAILED': 'critical',
  'CONFIGURATION_ERROR': 'critical',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get HTTP status code for an error code
 */
export function getHttpStatusCode(errorCode: StandardErrorCode): number {
  return ERROR_HTTP_STATUS_MAP[errorCode] || 500;
}

/**
 * Get error category for an error code
 */
export function getErrorCategory(errorCode: StandardErrorCode): ErrorCategory {
  return ERROR_CATEGORY_MAP[errorCode] || 'unknown';
}

/**
 * Get error severity for an error code
 */
export function getErrorSeverity(errorCode: StandardErrorCode): ErrorSeverity {
  return ERROR_SEVERITY_MAP[errorCode] || 'medium';
}

/**
 * Check if an error is retryable based on its category and code
 */
export function isRetryableError(errorCode: StandardErrorCode): boolean {
  const retryableErrors: StandardErrorCode[] = [
    'TIMEOUT_ERROR',
    'REQUEST_TIMEOUT',
    'OPERATION_TIMEOUT',
    'DATABASE_TIMEOUT',
    'NETWORK_ERROR',
    'CONNECTION_FAILED',
    'SERVICE_UNREACHABLE',
    'SERVICE_UNAVAILABLE',
    'RATE_LIMIT_EXCEEDED',
    'DATABASE_CONNECTION_FAILED',
    'INTERNAL_SERVER_ERROR',
  ];
  
  return retryableErrors.includes(errorCode);
}

/**
 * Check if an error should be logged based on its severity
 */
export function shouldLogError(severity: ErrorSeverity): boolean {
  return ['high', 'critical'].includes(severity);
}

/**
 * Generate a correlation ID for error tracking
 */
export function generateCorrelationId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}