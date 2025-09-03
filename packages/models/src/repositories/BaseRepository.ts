/**
 * Base Repository with Standardized Error Handling
 * 
 * Provides common error handling patterns and utilities for all repositories
 * in the expedition system.
 */

import {
  BaseError,
  DatabaseError,
  NotFoundError,
  ConflictError,
  ValidationError
} from '@starships/errors';

// Local error context interface
interface ErrorContext {
  service: string;
  operation: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

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
      throw new ConflictError(
        'Database constraint violation',
        'database_constraint',
        { resource: resource || 'Resource', originalError: error.message },
        context.operation,
        `${context.service}/${context.operation}`
      );
    }

    if (this.isConnectionError(error)) {
      throw new DatabaseError(
        'Database connection failed',
        'connection',
        undefined,
        { originalError: error.message },
        context.operation,
        `${context.service}/${context.operation}`
      );
    }

    if (this.isTimeoutError(error)) {
      throw new DatabaseError(
        'Database operation timeout',
        'timeout',
        undefined,
        { originalError: error.message },
        context.operation,
        `${context.service}/${context.operation}`
      );
    }

    if (this.isQueryError(error)) {
      throw new DatabaseError(
        'Database query failed',
        'query',
        undefined,
        { originalError: error.message },
        context.operation,
        `${context.service}/${context.operation}`
      );
    }

    // Generic database error
    throw new DatabaseError(
      'Database operation failed',
      context.operation,
      undefined,
      { originalError: error.message || 'Unknown database error' },
      context.operation,
      `${context.service}/${context.operation}`
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
    throw new NotFoundError(
      `${resource} ${resourceId ? `with ID ${resourceId}` : ''} not found`,
      resource,
      resourceId || 'unknown',
      undefined,
      operation || 'find',
      `${this.serviceName}/${operation || 'find'}`
    );
  }

  /**
   * Handle validation errors
   */
  protected handleValidationError(
    fieldErrors: Array<{ field: string; message: string; value?: any }>,
    operation?: string
  ): never {
    const message = fieldErrors.map(e => `${e.field}: ${e.message}`).join(', ');
    throw new ValidationError(
      message,
      fieldErrors[0]?.field,
      { fieldErrors },
      operation || 'validate',
      `${this.serviceName}/${operation || 'validate'}`
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
    throw new ConflictError(
      conflictReason,
      'resource_conflict',
      { resource, resourceId },
      operation || 'create',
      `${this.serviceName}/${operation || 'create'}`
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
      // If it's already a BaseError, re-throw
      if (error instanceof BaseError) {
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
      // If it's already a BaseError, re-throw
      if (error instanceof BaseError) {
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
  // SIMPLIFIED ENTITY CREATION HELPERS
  // ============================================================================

  /**
   * Create a new entity with automatic ID generation
   * This method automatically generates a UUID for the entity using Neo4j's randomUUID()
   *
   * @param nodeLabel - Neo4j node label (e.g., 'User', 'Starship')
   * @param properties - Object properties to set on the node (excluding id)
   * @returns The created entity with generated ID
   */
  protected async createEntityWithAutoId<T>(
    nodeLabel: string,
    properties: Record<string, any>
  ): Promise<T> {
    const connection = await import('../helpers/database').then(m => m.getConnection());
    
    // Remove any existing 'id' from properties - Neo4j will generate it
    const { id, ...propsWithoutId } = properties;
    
    const result = await connection.executeWrite<{ n: T }>(
      `CREATE (n:${nodeLabel})
       SET n.id = randomUUID(),
           n += $props
       RETURN n`,
      { props: propsWithoutId }
    );
    
    return result[0].n;
  }

  /**
   * MERGE (upsert) operation with automatic ID generation on CREATE
   * Uses MERGE for upsert operations while ensuring ID is only set on CREATE
   *
   * @param nodeLabel - Neo4j node label
   * @param matchProperties - Properties used for MERGE matching
   * @param createProperties - Properties set only on CREATE
   * @param updateProperties - Properties set only on MATCH
   * @returns The merged entity
   */
  protected async mergeEntityWithAutoId<T>(
    nodeLabel: string,
    matchProperties: Record<string, any>,
    createProperties: Record<string, any> = {},
    updateProperties: Record<string, any> = {}
  ): Promise<T> {
    const connection = await import('../helpers/database').then(m => m.getConnection());
    
    // Remove ID from all property sets - Neo4j will generate it
    const { id: _, ...matchProps } = matchProperties;
    const { id: __, ...createProps } = createProperties;
    const { id: ___, ...updateProps } = updateProperties;

    let cypher = `MERGE (n:${nodeLabel} {${Object.keys(matchProps).map(key => `${key}: $match.${key}`).join(', ')}})`;
    
    if (Object.keys(createProps).length > 0) {
      cypher += `\nON CREATE SET n.id = randomUUID(), n += $create`;
    } else {
      cypher += `\nON CREATE SET n.id = randomUUID()`;
    }
    
    if (Object.keys(updateProps).length > 0) {
      cypher += `\nON MATCH SET n += $update`;
    }
    
    cypher += `\nRETURN n`;

    const parameters: Record<string, any> = { match: matchProps };
    if (Object.keys(createProps).length > 0) {
      parameters.create = createProps;
    }
    if (Object.keys(updateProps).length > 0) {
      parameters.update = updateProps;
    }

    const result = await connection.executeWrite<{ n: T }>(cypher, parameters);
    return result[0].n;
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
    code: string,
    message: string,
    operation?: string,
    resource?: string,
    resourceId?: string
  ): never {
    throw new DatabaseError(
      message,
      operation || 'unknown',
      undefined,
      { code, resource, resourceId },
      operation || 'unknown',
      `${this.serviceName}/${operation || 'unknown'}`
    );
  }
}

export default BaseRepository;