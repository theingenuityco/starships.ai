/**
 * Base repository class with standardized error handling and validation utilities for PostgreSQL
 */

import { getConnection, PostgresConnection } from '@/helpers/database';
import { AppError, ConflictError, DatabaseError, NotFoundError, ValidationError } from '@starships/errors';
import { nanoid } from 'nanoid';

/**
 * Base repository with standardized error handling and validation for PostgreSQL
 */
export abstract class BaseRepository {
  protected serviceName: string;
  private connection: PostgresConnection | null = null;

  constructor(serviceName: string, connection?: PostgresConnection) {
    this.serviceName = serviceName;
    this.connection = connection || null;
  }

  /**
   * Get database connection with lazy initialization and caching
   */
  protected getConnection(): PostgresConnection {
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
    additionalMetadata?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      component: this.serviceName,
      operation,
      resource,
      resourceId,
      requestId: nanoid(),
      metadata: {
        component: 'repository',
        ...additionalMetadata,
      },
    };
  }

  /**
   * Handle database errors and convert to standardized error types
   */
  protected handleDatabaseError(error: unknown, operation: string, resource?: string, resourceId?: string): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.createContext(operation, resource, resourceId, {
      originalError: errorMessage,
    });

    // Handle specific PostgreSQL error types
    if (this.isConstraintViolationError(error)) {
      throw new ConflictError('Database constraint violation', error instanceof Error ? error : undefined);
    }

    if (this.isConnectionError(error)) {
      throw new DatabaseError('connection', error instanceof Error ? error : undefined);
    }

    if (this.isTimeoutError(error)) {
      throw new DatabaseError('timeout', error instanceof Error ? error : undefined);
    }

    if (this.isQueryError(error)) {
      throw new DatabaseError('query', error instanceof Error ? error : undefined);
    }

    // Generic database error
    throw new DatabaseError(operation, error instanceof Error ? error : undefined);
  }

  /**
   * Handle not found scenarios with standardized error response
   */
  protected handleNotFound(resource: string, resourceId?: string): never {
    throw new NotFoundError(resource, resourceId || 'unknown');
  }

  /**
   * Handle validation errors with detailed field-level error information
   */
  protected handleValidationError(fieldErrors: Array<{ field: string; message: string; value?: unknown }>): never {
    const message = fieldErrors.map((e) => `${e.field}: ${e.message}`).join(', ');
    throw new ValidationError(message, fieldErrors[0]?.field, { fieldErrors });
  }

  /**
   * Handle conflict errors such as duplicate resources or constraint violations
   */
  protected handleConflict(resource: string, conflictReason: string): never {
    throw new ConflictError(conflictReason);
  }

  /**
   * Wrap asynchronous repository operations with standardized error handling
   */
  protected async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    resource?: string,
    resourceId?: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      // If it's already an AppError, re-throw
      if (error instanceof AppError) {
        throw error;
      }

      // Handle database errors
      this.handleDatabaseError(error, operationName, resource, resourceId);
    }
  }

  /**
   * Wrap synchronous repository operations with standardized error handling
   */
  protected executeWithErrorHandlingSync<T>(operation: () => T, operationName: string, resource?: string, resourceId?: string): T {
    try {
      return operation();
    } catch (error: unknown) {
      // If it's already an AppError, re-throw
      if (error instanceof AppError) {
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
   * Check if error is a constraint violation (PostgreSQL specific)
   */
  private isConstraintViolationError(error: unknown): boolean {
    if (!error) return false;

    const pgError = error as { code?: string; constraint?: string };

    // PostgreSQL constraint violation error codes
    const constraintErrorCodes = [
      '23000', // integrity_constraint_violation
      '23001', // restrict_violation
      '23502', // not_null_violation
      '23503', // foreign_key_violation
      '23505', // unique_violation
      '23514', // check_violation
      '23P01', // exclusion_violation
    ];

    return constraintErrorCodes.includes(pgError.code || '');
  }

  /**
   * Check if error is a connection error
   */
  private isConnectionError(error: unknown): boolean {
    if (!error) return false;

    const pgError = error as { code?: string; message?: string };
    const connectionErrorCodes = ['08000', '08003', '08006', '08001', '08004'];
    const errorMessage = pgError.message?.toLowerCase() || '';

    return (
      connectionErrorCodes.includes(pgError.code || '') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('connect') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound')
    );
  }

  /**
   * Check if error is a timeout error
   */
  private isTimeoutError(error: unknown): boolean {
    if (!error) return false;

    const pgError = error as { code?: string; message?: string };
    const errorMessage = pgError.message?.toLowerCase() || '';

    return (
      pgError.code === '57014' || // query_canceled
      errorMessage.includes('timeout') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('time out') ||
      errorMessage.includes('timed out')
    );
  }

  /**
   * Check if error is a query error
   */
  private isQueryError(error: unknown): boolean {
    if (!error) return false;

    const pgError = error as { code?: string; message?: string };
    const queryErrorCodes = ['42000', '42601', '42501', '42602', '42622', '42723'];
    const errorMessage = pgError.message?.toLowerCase() || '';

    return (
      queryErrorCodes.includes(pgError.code || '') ||
      errorMessage.includes('syntax error') ||
      errorMessage.includes('invalid query') ||
      errorMessage.includes('query failed') ||
      errorMessage.includes('sql error')
    );
  }

  // ============================================================================
  // SIMPLIFIED ENTITY CREATION HELPERS
  // ============================================================================

  /**
   * Create a new entity with automatic ID generation
   */
  protected async createEntity<T>(tableName: string, properties: Record<string, unknown>, connection?: PostgresConnection): Promise<T> {
    const conn = connection || this.getConnection();

    // Generate nanoid in application layer for consistent, compact IDs
    const generatedId = nanoid();

    // Remove any existing 'id' from properties and add the generated one
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...propsWithoutId } = properties;
    const propsWithGeneratedId = { ...propsWithoutId, id: generatedId };

    // Process JSON fields properly
    const processedProps: Record<string, unknown> = {};
    const jsonFields = ['parameters', 'blueprint', 'configuration_fields', 'transforms', 'mutations'];
    
    for (const [key, value] of Object.entries(propsWithGeneratedId)) {
      if (jsonFields.includes(key) && value !== null && value !== undefined) {
        // Serialize objects/arrays to JSON strings for JSONB columns
        processedProps[key] = typeof value === 'string' ? value : JSON.stringify(value);
      } else {
        processedProps[key] = value;
      }
    }

    // Build column names and placeholders
    const columns = Object.keys(processedProps);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const values = Object.values(processedProps);

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const result = await conn.query<T>(query, values);

    if (!result || result.length === 0) {
      throw new Error(`Failed to create ${tableName}`);
    }

    return result[0];
  }

  /**
   * Update an entity by ID
   */
  protected async updateEntity<T>(
    tableName: string,
    id: string,
    updates: Record<string, unknown>,
    connection?: PostgresConnection
  ): Promise<T | null> {
    const conn = connection || this.getConnection();

    // Remove id from updates and add updated_at timestamp
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _updateId, ...updateProps } = updates;
    const propsWithTimestamp = { ...updateProps, updated_at: new Date().toISOString() };

    // Build SET clause and properly serialize JSON fields
    const processedProps: Record<string, unknown> = {};
    const jsonFields = ['parameters', 'blueprint', 'configuration_fields', 'transforms', 'mutations'];
    
    for (const [key, value] of Object.entries(propsWithTimestamp)) {
      if (jsonFields.includes(key) && value !== null && value !== undefined) {
        // Serialize objects/arrays to JSON strings for JSONB columns
        processedProps[key] = typeof value === 'string' ? value : JSON.stringify(value);
      } else {
        processedProps[key] = value;
      }
    }

    const setClause = Object.keys(processedProps)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = [id, ...Object.values(processedProps)];

    const query = `
      UPDATE ${tableName}
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;

    const result = await conn.query<T>(query, values);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Delete an entity by ID
   */
  protected async deleteEntity(tableName: string, id: string, connection?: PostgresConnection): Promise<boolean> {
    const conn = connection || this.getConnection();

    const query = `DELETE FROM ${tableName} WHERE id = $1`;
    const result = await conn.query(query, [id]);

    return (result as unknown as { rowCount: number }).rowCount > 0;
  }

  /**
   * Find entity by ID
   */
  protected async findEntityById<T>(tableName: string, id: string, connection?: PostgresConnection): Promise<T | null> {
    const conn = connection || this.getConnection();

    const query = `SELECT * FROM ${tableName} WHERE id = $1`;
    const result = await conn.query<T>(query, [id]);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Find all entities in a table
   */
  protected async findAllEntities<T>(
    tableName: string,
    orderBy: string = 'created_at DESC',
    connection?: PostgresConnection
  ): Promise<T[]> {
    const conn = connection || this.getConnection();

    const query = `SELECT * FROM ${tableName} ORDER BY ${orderBy}`;
    return await conn.query<T>(query);
  }

  /**
   * Count entities in a table
   */
  protected async countEntities(
    tableName: string,
    whereClause?: string,
    params?: unknown[],
    connection?: PostgresConnection
  ): Promise<number> {
    const conn = connection || this.getConnection();

    let query = `SELECT COUNT(*) as count FROM ${tableName}`;
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }

    const result = await conn.queryOne<{ count: string }>(query, params || []);
    return result ? parseInt(result.count, 10) : 0;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Log repository operations
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: unknown): void {
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
  protected createBusinessLogicError(_code: string, _message: string, operation?: string): never {
    throw new DatabaseError(operation || 'unknown');
  }
}

export default BaseRepository;
