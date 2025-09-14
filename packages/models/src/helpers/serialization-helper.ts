/**
 * Safe deserialization helpers for repository methods
 * Provides type-safe deserialization with proper error handling and validation
 */

import { plainToInstance } from 'class-transformer';
import 'reflect-metadata';

/**
 * Safely deserialize database record to entity with error handling
 * @param entityClass - The entity class to deserialize to
 * @param data - Raw data from database
 * @param options - Additional plainToInstance options
 * @returns Deserialized entity
 * @throws Error if deserialization fails
 */
export function safeDeserialize<T>(
  entityClass: new () => T,
  data: unknown,
  options: {
    enableImplicitConversion?: boolean;
    excludeExtraneousValues?: boolean;
    strategy?: 'excludeAll' | 'exposeAll';
  } = {}
): T {
  try {
    // Validate input
    if (data === null || data === undefined) {
      throw new Error(`Cannot deserialize null or undefined data to ${entityClass.name}`);
    }

    if (typeof data !== 'object') {
      throw new Error(`Expected object for ${entityClass.name} deserialization, got ${typeof data}`);
    }

    // Set default options for consistent deserialization
    const defaultOptions = {
      strategy: 'excludeAll' as const,
      excludeExtraneousValues: true,
      enableImplicitConversion: false,
      ...options,
    };

    // Perform deserialization
    const entity = plainToInstance(entityClass, data, defaultOptions);

    if (!entity) {
      throw new Error(`Failed to create ${entityClass.name} instance from data`);
    }

    return entity;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Deserialization failed for ${entityClass.name}: ${errorMessage}`);
  }
}

/**
 * Safely deserialize array of database records to entities
 * @param entityClass - The entity class to deserialize to
 * @param dataArray - Array of raw data from database
 * @param options - Additional plainToInstance options
 * @returns Array of deserialized entities
 */
export function safeDeserializeArray<T>(
  entityClass: new () => T,
  dataArray: unknown[],
  options?: Parameters<typeof safeDeserialize>[2]
): T[] {
  if (!Array.isArray(dataArray)) {
    throw new Error(`Expected array for ${entityClass.name} array deserialization, got ${typeof dataArray}`);
  }

  return dataArray.map((item, index) => {
    try {
      return safeDeserialize(entityClass, item, options);
    } catch (error) {
      throw new Error(`Array deserialization failed at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Type-safe wrapper for database records that maintains type information
 * This helps avoid the unsafe `as unknown as Record<string, unknown>` pattern
 */
export function toDatabaseRecord(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) {
    throw new Error('Cannot convert null or undefined to database record');
  }

  if (typeof data !== 'object') {
    throw new Error(`Cannot convert ${typeof data} to database record`);
  }

  // This is still a type assertion, but it's centralized and has proper validation
  return data as Record<string, unknown>;
}

/**
 * Enhanced fromDatabaseRecord method for entities
 * Provides better error handling and type safety
 */
export function createFromDatabaseRecord<T>(entityClass: new () => T, data: unknown): T {
  try {
    const record = toDatabaseRecord(data);
    return safeDeserialize(entityClass, record);
  } catch (error) {
    throw new Error(`Failed to create ${entityClass.name} from database record: ${error instanceof Error ? error.message : String(error)}`);
  }
}
