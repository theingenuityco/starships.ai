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
  // Check if entityClass is valid
  if (!entityClass || typeof entityClass !== 'function') {
    throw new Error('Invalid entity class provided');
  }

  if (data === null || data === undefined) {
    throw new Error('Cannot deserialize null or undefined data');
  }

  if (typeof data !== 'object') {
    throw new Error(`Expected object for ${entityClass.name} deserialization`);
  }

  const defaultOptions = {
    strategy: 'excludeAll' as const, // Respect @Expose decorators
    excludeExtraneousValues: true, // Filter out non-exposed properties
    enableImplicitConversion: false, // Let @Transform decorators handle conversions explicitly
    ...options,
  };

  const entity = plainToInstance(entityClass, data, defaultOptions);

  if (!entity) {
    throw new Error(`Failed to create ${entityClass.name} instance from data`);
  }

  return entity;
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
 * Standardized method to deserialize single database record to entity
 * Replaces fromDatabaseRecord static methods on entities
 */
export function fromDatabase<T>(entityClass: new () => T, data: unknown): T {
  // Handle entity class validation first for proper error messages
  if (!entityClass || typeof entityClass !== 'function') {
    throw new Error('Invalid entity class provided');
  }

  if (data === null || data === undefined) {
    throw new Error(`Cannot deserialize null or undefined data to ${entityClass.name}`);
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Expected object for ${entityClass.name} deserialization`);
  }

  const record = data as Record<string, unknown>;
  return safeDeserialize(entityClass, record);
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

  try {
    // Use instanceToPlain to apply @Transform decorators for serialization
    const serialized = instanceToPlain(entity, {
      strategy: 'excludeAll', // Only serialize @Expose decorated properties
      excludeExtraneousValues: true,
      enableImplicitConversion: false,
    });

    // If serialized object is empty or null, return the original object
    if (!serialized || Object.keys(serialized).length === 0) {
      return entity as Record<string, unknown>;
    }

    // Remove undefined properties from serialized object
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(serialized)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    // Handle circular references - return original object as-is
    return entity as Record<string, unknown>;
  }
}
