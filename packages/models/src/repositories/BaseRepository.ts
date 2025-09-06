/**
 * Base repository class with standardized error handling and validation utilities
 */

import { getConnection, Neo4jConnection } from '@/helpers/database';
import { ModelSerializer } from '@/helpers/serializer';
import type { RepositoryErrorContext } from '@starships/errors';
import { BaseError, ConflictError, DatabaseError, ErrorContextUtils, NotFoundError, ValidationError } from '@starships/errors';

/**
 * Base repository with standardized error handling and validation
 */
export abstract class BaseRepository {
  protected serviceName: string;
  private connection: Neo4jConnection | null = null;

  constructor(serviceName: string, connection?: Neo4jConnection) {
    this.serviceName = serviceName;
    this.connection = connection || null;
  }

  /**
   * Get database connection with lazy initialization and caching
   */
  protected getConnection(): Neo4jConnection {
    if (!this.connection) {
      this.connection = getConnection();
    }
    return this.connection;
  }

  /** Create error context for repository operations */
  protected createContext(
    operation: string,
    resource?: string,
    resourceId?: string,
    additionalMetadata?: Record<string, any>
  ): RepositoryErrorContext {
    return ErrorContextUtils.repository(this.serviceName, operation, {
      resource,
      resourceId,
      metadata: {
        component: 'repository',
        ...additionalMetadata,
      },
    });
  }

  /**
   * Handle database errors and convert to standardized error types
   *
   * This method analyzes various database error types and converts them into
   * standardized application errors with proper context and error codes.
   *
   * @param error - The original database error
   * @param operation - The operation that caused the error
   * @param resource - The resource type being operated on (optional)
   * @param resourceId - The specific resource ID (optional)
   * @throws {ConflictError} For constraint violations
   * @throws {DatabaseError} For connection, timeout, or query errors
   *
   * @protected
   */
  protected handleDatabaseError(error: any, operation: string, resource?: string, resourceId?: string): never {
    const context = this.createContext(operation, resource, resourceId, {
      originalError: error.message || error.toString(),
    });

    // Handle specific database error types
    if (this.isConstraintViolationError(error)) {
      throw new ConflictError(
        'Database constraint violation',
        'database_constraint',
        { resource: resource || 'Resource', originalError: error.message },
        context.requestId,
        `${context.component}/${context.operation}`,
        context
      );
    }

    if (this.isConnectionError(error)) {
      throw new DatabaseError(
        'Database connection failed',
        'connection',
        undefined,
        { originalError: error.message },
        context.requestId,
        `${context.component}/${context.operation}`,
        context
      );
    }

    if (this.isTimeoutError(error)) {
      throw new DatabaseError(
        'Database operation timeout',
        'timeout',
        undefined,
        { originalError: error.message },
        context.requestId,
        `${context.component}/${context.operation}`,
        context
      );
    }

    if (this.isQueryError(error)) {
      throw new DatabaseError(
        'Database query failed',
        'query',
        undefined,
        { originalError: error.message },
        context.requestId,
        `${context.component}/${context.operation}`,
        context
      );
    }

    // Generic database error
    throw new DatabaseError(
      'Database operation failed',
      context.operation,
      undefined,
      { originalError: error.message || 'Unknown database error' },
      context.requestId,
      `${context.component}/${context.operation}`,
      context
    );
  }

  /**
   * Handle not found scenarios with standardized error response
   *
   * @param resource - Type of resource that was not found
   * @param resourceId - ID of the resource that was not found (optional)
   * @param operation - Operation that was being performed (optional)
   * @throws {NotFoundError} Always throws a standardized not found error
   *
   * @protected
   */
  protected handleNotFound(resource: string, resourceId?: string, operation?: string): never {
    const context = this.createContext(operation || 'find', resource, resourceId);

    throw new NotFoundError(
      `${resource} ${resourceId ? `with ID ${resourceId}` : ''} not found`,
      resource,
      resourceId || 'unknown',
      undefined,
      context.requestId,
      `${context.component}/${context.operation}`,
      context
    );
  }

  /**
   * Handle validation errors with detailed field-level error information
   *
   * @param fieldErrors - Array of field validation errors
   * @param operation - Operation that triggered validation (optional)
   * @throws {ValidationError} Always throws a standardized validation error
   *
   * @protected
   */
  protected handleValidationError(fieldErrors: Array<{ field: string; message: string; value?: any }>, operation?: string): never {
    const context = this.createContext(operation || 'validate', undefined, undefined, {
      fieldErrors,
    });

    const message = fieldErrors.map((e) => `${e.field}: ${e.message}`).join(', ');
    throw new ValidationError(
      message,
      fieldErrors[0]?.field,
      { fieldErrors },
      context.requestId,
      `${context.component}/${context.operation}`,
      context
    );
  }

  /**
   * Handle conflict errors such as duplicate resources or constraint violations
   *
   * @param resource - Type of resource causing the conflict
   * @param conflictReason - Human-readable reason for the conflict
   * @param operation - Operation that caused the conflict (optional)
   * @param resourceId - ID of the conflicting resource (optional)
   * @throws {ConflictError} Always throws a standardized conflict error
   *
   * @protected
   */
  protected handleConflict(resource: string, conflictReason: string, operation?: string, resourceId?: string): never {
    const context = this.createContext(operation || 'create', resource, resourceId, {
      conflictReason,
    });

    throw new ConflictError(
      conflictReason,
      'resource_conflict',
      { resource, resourceId },
      context.requestId,
      `${context.component}/${context.operation}`,
      context
    );
  }

  /**
   * Wrap asynchronous repository operations with standardized error handling
   *
   * This method provides a consistent way to handle errors across all repository
   * operations, ensuring that database errors are properly converted to application
   * errors with appropriate context and error codes.
   *
   * @template T - Return type of the operation
   * @param operation - The async operation to execute
   * @param operationName - Name of the operation for error context
   * @param resource - Resource type being operated on (optional)
   * @param resourceId - Specific resource ID (optional)
   * @returns Promise resolving to the operation result
   * @throws {BaseError} Standardized application errors based on the underlying error
   *
   * @protected
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
   * Wrap synchronous repository operations with standardized error handling
   *
   * @template T - Return type of the operation
   * @param operation - The synchronous operation to execute
   * @param operationName - Name of the operation for error context
   * @param resource - Resource type being operated on (optional)
   * @param resourceId - Specific resource ID (optional)
   * @returns The operation result
   * @throws {BaseError} Standardized application errors based on the underlying error
   *
   * @protected
   */
  protected executeWithErrorHandlingSync<T>(operation: () => T, operationName: string, resource?: string, resourceId?: string): T {
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

    const constraintPatterns = ['constraint', 'unique', 'duplicate', 'foreign key', 'check constraint', 'not null', 'primary key'];

    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = (error.code || '').toLowerCase();

    return constraintPatterns.some((pattern) => errorMessage.includes(pattern) || errorCode.includes(pattern));
  }

  /**
   * Check if error is a connection error
   */
  private isConnectionError(error: any): boolean {
    if (!error) return false;

    const connectionPatterns = ['connection', 'connect', 'econnrefused', 'enotfound', 'network', 'timeout'];

    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = (error.code || '').toLowerCase();

    return connectionPatterns.some((pattern) => errorMessage.includes(pattern) || errorCode.includes(pattern));
  }

  /**
   * Check if error is a timeout error
   */
  private isTimeoutError(error: any): boolean {
    if (!error) return false;

    const timeoutPatterns = ['timeout', 'etimedout', 'time out', 'timed out'];

    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = (error.code || '').toLowerCase();

    return timeoutPatterns.some((pattern) => errorMessage.includes(pattern) || errorCode.includes(pattern));
  }

  /**
   * Check if error is a query error
   */
  private isQueryError(error: any): boolean {
    if (!error) return false;

    const queryPatterns = ['syntax error', 'invalid query', 'query failed', 'sql error', 'cypher error'];

    const errorMessage = (error.message || '').toLowerCase();

    return queryPatterns.some((pattern) => errorMessage.includes(pattern));
  }

  // ============================================================================
  // VALIDATION HELPERS
  // ============================================================================
  // Note: Entity-specific validation is now handled by individual entities
  // using class-validator decorators. These methods are kept for backward compatibility
  // with repositories that haven't migrated to the entity validation pattern.

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
  protected async createEntityWithAutoId<T>(nodeLabel: string, properties: Record<string, any>, connection?: any): Promise<T> {
    // Use provided connection or get from centralized getConnection method
    const conn = connection || this.getConnection();

    // Remove any existing 'id' from properties - Neo4j will generate it
    const { id, ...propsWithoutId } = properties;

    const result = await conn.executeWrite(
      `CREATE (n:${nodeLabel})
       SET n.id = randomUUID(),
           n += $props
       RETURN n`,
      { props: propsWithoutId }
    );

    if (!result || result.length === 0) {
      throw new Error(`Failed to create ${nodeLabel}`);
    }

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
   * @param connection - Optional database connection (for testing)
   * @returns The merged entity
   */
  protected async mergeEntityWithAutoId<T>(
    nodeLabel: string,
    matchProperties: Record<string, any>,
    createProperties: Record<string, any> = {},
    updateProperties: Record<string, any> = {},
    connection?: any
  ): Promise<T> {
    // Use provided connection or get from centralized getConnection method
    const conn = connection || this.getConnection();

    // Remove ID from all property sets - Neo4j will generate it
    const { id: _, ...matchProps } = matchProperties;
    const { id: __, ...createProps } = createProperties;
    const { id: ___, ...updateProps } = updateProperties;

    let cypher = `MERGE (n:${nodeLabel} {${Object.keys(matchProps)
      .map((key) => `${key}: $match.${key}`)
      .join(', ')}})`;

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

    const result = await conn.executeWrite(cypher, parameters);
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
  protected createBusinessLogicError(code: string, message: string, operation?: string, resource?: string, resourceId?: string): never {
    const context = this.createContext(operation || 'unknown', resource, resourceId, {
      businessLogicCode: code,
    });

    throw new DatabaseError(
      message,
      operation || 'unknown',
      undefined,
      { code, resource, resourceId },
      context.requestId,
      `${context.component}/${context.operation}`,
      context
    );
  }

  // ============================================================================
  // SERIALIZATION HELPERS
  // ============================================================================
  // Note: Complex serialization/deserialization is now handled by individual entities
  // using class-transformer decorators. Use Entity.fromData() and entity.toPlainObject().

  /**
   * Safely parse JSON with fallback value
   * Essential utility for database JSON fields
   */
  protected safeJsonParse<T>(jsonString: string | null | undefined, fallback: T): T {
    return ModelSerializer.safeJsonParse(jsonString, fallback);
  }

  /**
   * Safely stringify JSON
   * Essential utility for database JSON fields
   */
  protected safeJsonStringify(value: any): string | null {
    return ModelSerializer.safeJsonStringify(value);
  }

  /**
   * Helper method for common mapping operations from database records
   * Handles JSON parsing, date conversion, and type safety
   *
   * @param record - Database record
   * @param jsonFields - Fields that should be parsed as JSON
   * @param dateFields - Fields that should be converted to Date objects
   * @param defaultValues - Default values for missing fields
   * @returns Mapped and transformed object
   */
  protected mapFromDatabaseRecord<T>(
    record: any,
    options?: {
      jsonFields?: string[];
      dateFields?: string[];
      arrayFields?: string[];
      defaultValues?: Record<string, any>;
    }
  ): T {
    if (!record) return record;

    const mapped = { ...record };
    const opts = options || {};

    // Handle JSON fields
    if (opts.jsonFields) {
      for (const field of opts.jsonFields) {
        if (mapped[field] && typeof mapped[field] === 'string') {
          mapped[field] = this.safeJsonParse(mapped[field], null);
        }
      }
    }

    // Handle date fields
    if (opts.dateFields) {
      for (const field of opts.dateFields) {
        if (mapped[field]) {
          mapped[field] = new Date(mapped[field]);
        }
      }
    }

    // Handle array fields with defaults
    if (opts.arrayFields) {
      for (const field of opts.arrayFields) {
        if (!Array.isArray(mapped[field])) {
          mapped[field] = [];
        }
      }
    }

    // Apply default values
    if (opts.defaultValues) {
      for (const [field, defaultValue] of Object.entries(opts.defaultValues)) {
        if (mapped[field] === undefined || mapped[field] === null) {
          mapped[field] = defaultValue;
        }
      }
    }

    return mapped as T;
  }
}

export default BaseRepository;
