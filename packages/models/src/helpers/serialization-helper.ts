/**
 * Lean serialization helpers for repository methods
 * Provides standardized fromDatabase/toDatabase methods
 */

import { plainToInstance, instanceToPlain } from 'class-transformer';
import 'reflect-metadata';

/**
 * Safely deserialize database record to entity with error handling
 */
function safeDeserialize<T>(
  entityClass: new () => T,
  data: unknown,
  options: {
    enableImplicitConversion?: boolean;
    excludeExtraneousValues?: boolean;
    strategy?: 'excludeAll' | 'exposeAll';
  } = {}
): T {
  try {
    // Check if entityClass is valid
    if (!entityClass || typeof entityClass !== 'function') {
      throw new Error(`Invalid entity class provided: ${entityClass}`);
    }

    if (data === null || data === undefined) {
      throw new Error(`Cannot deserialize null or undefined data to ${entityClass.name}`);
    }

    if (typeof data !== 'object') {
      throw new Error(`Expected object for ${entityClass.name} deserialization, got ${typeof data}`);
    }

    const defaultOptions = {
      strategy: 'exposeAll' as const, // Changed from 'excludeAll' to 'exposeAll' to include all fields
      excludeExtraneousValues: false, // Changed to false to be more permissive
      enableImplicitConversion: true, // Changed to true to handle type conversions
      ...options,
    };

    const entity = plainToInstance(entityClass, data, defaultOptions);

    if (!entity) {
      throw new Error(`Failed to create ${entityClass.name} instance from data`);
    }

    return entity;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Deserialization failed for ${entityClass?.name || 'unknown'}: ${errorMessage}`);
  }
}

/**
 * Safely deserialize array of database records to entities
 */
function safeDeserializeArray<T>(entityClass: new () => T, dataArray: unknown[], options?: Parameters<typeof safeDeserialize>[2]): T[] {
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
 * Type-safe wrapper for database records
 */
function validateDatabaseRecord(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) {
    throw new Error('Cannot convert null or undefined to database record');
  }

  if (typeof data !== 'object') {
    throw new Error(`Cannot convert ${typeof data} to database record`);
  }

  return data as Record<string, unknown>;
}

/**
 * Standardized method to deserialize single database record to entity
 * Replaces fromDatabaseRecord static methods on entities
 */
export function fromDatabase<T>(entityClass: new () => T, data: unknown): T {
  try {
    const record = validateDatabaseRecord(data);
    return safeDeserialize(entityClass, record);
  } catch (error) {
    throw new Error(`Failed to create ${entityClass.name} from database record: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Standardized method to deserialize array of database records to entities
 * Replaces fromDatabaseRecord static methods on entities for arrays
 */
export function fromDatabaseArray<T>(entityClass: new () => T, dataArray: unknown[]): T[] {
  return safeDeserializeArray(entityClass, dataArray);
}

/**
 * Standardized method to serialize entities to database format
 * Replaces toDatabaseFormat instance methods on entities
 */
export function toDatabase(entity: unknown): Record<string, unknown> {
  if (!entity || typeof entity !== 'object') {
    throw new Error('Entity must be a valid object');
  }

  // Use exposeAll strategy to ensure all properties are serialized
  const serialized = instanceToPlain(entity, {
    strategy: 'exposeAll',
    excludeExtraneousValues: false,
    enableImplicitConversion: true,
  });

  // If serialized object is empty or null, return the original object
  if (!serialized || Object.keys(serialized).length === 0) {
    return entity as Record<string, unknown>;
  }

  return serialized;
}

// Backward compatibility - will be removed after refactor
export function createFromDatabaseRecord<T>(entityClass: new () => T, data: unknown): T {
  try {
    const record = validateDatabaseRecord(data);
    return safeDeserialize(entityClass, record);
  } catch (error) {
    throw new Error(`Failed to create ${entityClass.name} from database record: ${error instanceof Error ? error.message : String(error)}`);
  }
}
