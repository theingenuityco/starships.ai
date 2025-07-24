/**
 * Base Repository with Standardized Error Handling
 * 
 * Provides common error handling patterns and utilities for all repositories
 * in the expedition system.
 */

import {
  StandardError,
  DatabaseError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ErrorFactory,
  StandardErrorCode,
  ErrorContext
} from '@starships/protocol';

// ============================================================================
// BASE REPOSITORY CLASS
// ============================================================================

/**
 * Base repository class with standardized error handling
 */
export abstract class BaseRepository {
  protected serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Create error context for repository operations
   */
  protected createContext(operation: string, resource?: string, resourceId?: string): ErrorContext {
    return {
      service: this.serviceName,
      operation,
      resource,
      resourceId,
      metadata: { component: 'repository' }
    };
  }

  /**
   * Handle database errors and convert to standardized errors
   */
  protected handleDatabaseError(
    error: any,
    operation: string,
    resource?: string,
    resourceId?: string
  ): never {
    const context = this.createContext(operation, resource, resourceId);

    // Handle specific database error types
    if (this.isConstraintViolationError(error)) {
      throw ErrorFactory.conflict(
        resource || 'Resource',
        'Database constraint violation',
        context
      );
    }

    if (this.isConnectionError(error)) {
      throw ErrorFactory.businessLogic(
        'DATABASE_CONNECTION_FAILED',
        'Database connection failed',
        error.message,
        context
      );
    }

    if (this.isTimeoutError(error)) {
      throw ErrorFactory.businessLogic(
        'DATABASE_TIMEOUT',
        'Database operation timeout',
        error.message,
        context
      );
    }

    if (this.isQueryError(error)) {
      throw ErrorFactory.businessLogic(
        'DATABASE_QUERY_FAILED',
        'Database query failed',
        error.message,
        context
      );
    }

    // Generic database error
    throw ErrorFactory.businessLogic(
      'DATABASE_ERROR',
      'Database operation failed',
      error.message || 'Unknown database error',
      context
    );
  }

  /**
   * Handle not found scenarios
   */
  protected handleNotFound(
    resource: string,
    resourceId?: string,
    operation?: string
  ): never {
    throw ErrorFactory.notFound(
      resource,
      resourceId,
      this.createContext(operation || 'find', resource, resourceId)
    );
  }

  /**
   * Handle validation errors
   */
  protected handleValidationError(
    fieldErrors: Array<{ field: string; message: string; value?: any }>,
    operation?: string,
    resource?: string
  ): never {
    throw ErrorFactory.validation(
      fieldErrors,
      this.createContext(operation || 'validate', resource)
    );
  }

  /**
   * Handle conflict errors
   */
  protected handleConflict(
    resource: string,
    conflictReason: string,
    operation?: string,
    resourceId?: string
  ): never {
    throw ErrorFactory.conflict(
      resource,
      conflictReason,
      this.createContext(operation || 'create', resource, resourceId)
    );
  }

  /**
   * Wrap repository operations with error handling
   */
  protected async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    resource?: string,
    resourceId?: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      // If it's already a StandardError, re-throw
      if (error instanceof StandardError) {
        throw error;
      }

      // Handle database errors
      this.handleDatabaseError(error, operationName, resource, resourceId);
    }
  }

  /**
   * Wrap synchronous operations with error handling
   */
  protected executeWithErrorHandlingSync<T>(
    operation: () => T,
    operationName: string,
    resource?: string,
    resourceId?: string
  ): T {
    try {
      return operation();
    } catch (error: any) {
      // If it's already a StandardError, re-throw
      if (error instanceof StandardError) {
        throw error;
      }

      // Handle database errors
      this.handleDatabaseError(error, operationName, resource, resourceId);
    }
  }

  // ============================================================================
  // DATABASE ERROR DETECTION METHODS
  // ============================================================================

  /**
   * Check if error is a constraint violation
   */
  private isConstraintViolationError(error: any): boolean {
    if (!error) return false;

    const constraintPatterns = [
      'constraint',
      'unique',
      'duplicate',
      'foreign key',
      'check constraint',
      'not null',
      'primary key'
    ];

    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = (error.code || '').toLowerCase();

    return constraintPatterns.some(pattern => 
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    );
  }

  /**
   * Check if error is a connection error
   */
  private isConnectionError(error: any): boolean {
    if (!error) return false;

    const connectionPatterns = [
      'connection',
      'connect',
      'econnrefused',
      'enotfound',
      'network',
      'timeout'
    ];

    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = (error.code || '').toLowerCase();

    return connectionPatterns.some(pattern => 
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    );
  }

  /**
   * Check if error is a timeout error
   */
  private isTimeoutError(error: any): boolean {
    if (!error) return false;

    const timeoutPatterns = [
      'timeout',
      'etimedout',
      'time out',
      'timed out'
    ];

    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = (error.code || '').toLowerCase();

    return timeoutPatterns.some(pattern => 
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    );
  }

  /**
   * Check if error is a query error
   */
  private isQueryError(error: any): boolean {
    if (!error) return false;

    const queryPatterns = [
      'syntax error',
      'invalid query',
      'query failed',
      'sql error',
      'cypher error'
    ];

    const errorMessage = (error.message || '').toLowerCase();

    return queryPatterns.some(pattern => errorMessage.includes(pattern));
  }

  // ============================================================================
  // VALIDATION HELPERS
  // ============================================================================

  /**
   * Validate required fields
   */
  protected validateRequired(
    data: any,
    requiredFields: string[],
    operation?: string
  ): void {
    const errors: Array<{ field: string; message: string; value?: any }> = [];

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        errors.push({
          field,
          message: `${field} is required`,
          value: data[field]
        });
      }
    }

    if (errors.length > 0) {
      this.handleValidationError(errors, operation);
    }
  }

  /**
   * Validate field types
   */
  protected validateTypes(
    data: any,
    fieldTypes: Record<string, string>,
    operation?: string
  ): void {
    const errors: Array<{ field: string; message: string; value?: any }> = [];

    for (const [field, expectedType] of Object.entries(fieldTypes)) {
      if (data[field] !== undefined && typeof data[field] !== expectedType) {
        errors.push({
          field,
          message: `${field} must be of type ${expectedType}`,
          value: data[field]
        });
      }
    }

    if (errors.length > 0) {
      this.handleValidationError(errors, operation);
    }
  }

  /**
   * Validate string lengths
   */
  protected validateStringLengths(
    data: any,
    lengthConstraints: Record<string, { min?: number; max?: number }>,
    operation?: string
  ): void {
    const errors: Array<{ field: string; message: string; value?: any }> = [];

    for (const [field, constraints] of Object.entries(lengthConstraints)) {
      const value = data[field];
      if (typeof value === 'string') {
        if (constraints.min !== undefined && value.length < constraints.min) {
          errors.push({
            field,
            message: `${field} must be at least ${constraints.min} characters long`,
            value: value.length
          });
        }
        if (constraints.max !== undefined && value.length > constraints.max) {
          errors.push({
            field,
            message: `${field} must be no more than ${constraints.max} characters long`,
            value: value.length
          });
        }
      }
    }

    if (errors.length > 0) {
      this.handleValidationError(errors, operation);
    }
  }

  /**
   * Validate enum values
   */
  protected validateEnums(
    data: any,
    enumConstraints: Record<string, string[]>,
    operation?: string
  ): void {
    const errors: Array<{ field: string; message: string; value?: any }> = [];

    for (const [field, allowedValues] of Object.entries(enumConstraints)) {
      const value = data[field];
      if (value !== undefined && !allowedValues.includes(value)) {
        errors.push({
          field,
          message: `${field} must be one of: ${allowedValues.join(', ')}`,
          value
        });
      }
    }

    if (errors.length > 0) {
      this.handleValidationError(errors, operation);
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Log repository operations (can be overridden by subclasses)
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any): void {
    const logMessage = `[${this.serviceName.toUpperCase()}] ${message}`;
    
    switch (level) {
      case 'debug':
        console.debug(logMessage, context);
        break;
      case 'info':
        console.info(logMessage, context);
        break;
      case 'warn':
        console.warn(logMessage, context);
        break;
      case 'error':
        console.error(logMessage, context);
        break;
    }
  }

  /**
   * Create a standardized error for business logic violations
   */
  protected createBusinessLogicError(
    code: StandardErrorCode,
    message: string,
    operation?: string,
    resource?: string,
    resourceId?: string
  ): never {
    throw ErrorFactory.businessLogic(
      code,
      message,
      message,
      this.createContext(operation || 'unknown', resource, resourceId)
    );
  }
}

export default BaseRepository;