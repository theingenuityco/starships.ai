/**
 * Standardized Error Handling System
 * 
 * Provides comprehensive error types, classes, and utilities for consistent
 * error management across the entire expedition system.
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
 * Comprehensive error codes for the expedition system
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
  
  // Expedition-Specific Errors
  | 'EXPEDITION_NOT_FOUND'
  | 'EXPEDITION_ACCESS_DENIED'
  | 'EXPEDITION_ALREADY_STARTED'
  | 'EXPEDITION_CANNOT_MODIFY'
  | 'EXPEDITION_CANNOT_DELETE'
  | 'EXPEDITION_INVALID_STATUS'
  | 'EXPEDITION_WORKFLOW_FAILED'
  | 'EXPEDITION_4PHASE_START_FAILED'
  | 'EXPEDITION_PHASE_PROGRESSION_FAILED'
  | 'EXPEDITION_PLAN_APPROVAL_FAILED'
  | 'EXPEDITION_EXECUTION_START_FAILED'
  
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
  
  // Mission Orchestrator Errors
  | 'MISSION_ORCHESTRATOR_FAILED'
  | 'MISSION_ORCHESTRATOR_NOT_FOUND'
  | 'MISSION_ORCHESTRATOR_INITIALIZATION_FAILED'
  | 'MISSION_MESSAGE_SEND_FAILED'
  | 'MISSION_MESSAGE_INVALID'
  | 'MISSION_CHAT_FAILED'
  
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
// UTILITY FUNCTIONS (moved to server implementation)
// ============================================================================

/**
 * Generate a correlation ID for error tracking
 * Note: Implementation moved to server package, this is kept for compatibility
 */
export function generateCorrelationId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}