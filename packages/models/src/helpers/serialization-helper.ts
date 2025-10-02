/**
 * Lean serialization helpers for repository methods
 * Provides standardized fromDatabase/toDatabase methods with snake_case ↔ camelCase conversion
 */

import { plainToInstance, instanceToPlain } from 'class-transformer';
import 'reflect-metadata';

/**
 * Convert camelCase to snake_case
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case to camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert object keys from camelCase to snake_case for PostgreSQL
 */
function convertKeysToSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value;
  }
  return result;
}

/**
 * Convert object keys from snake_case to camelCase for entities
 */
function convertKeysToCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

/**
 * Standardized method to deserialize single database record to entity
 * Replaces fromDatabaseRecord static methods on entities
 * Automatically converts snake_case to camelCase
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
  // Convert snake_case keys to camelCase for entity compatibility
  const camelCaseRecord = convertKeysToCamelCase(record);

  // For entities with JSONB fields, we need to preserve nested object structure
  // Use less restrictive deserialization to avoid stripping nested properties
  return plainToInstance(entityClass, camelCaseRecord, {
    strategy: 'exposeAll', // Include all properties by default
    excludeExtraneousValues: false, // Don't filter out non-decorated nested properties
    enableImplicitConversion: true, // Allow type conversions
  });
}

/**
 * Standardized method to deserialize array of database records to entities
 * Replaces fromDatabaseRecord static methods on entities for arrays
 */
export function fromDatabaseArray<T>(entityClass: new () => T, dataArray: unknown[]): T[] {
  if (!Array.isArray(dataArray)) {
    throw new Error(`Expected array for ${entityClass.name} array deserialization, got ${typeof dataArray}`);
  }

  return dataArray.map((item, index) => {
    try {
      // Convert snake_case keys to camelCase for each item
      if (item && typeof item === 'object') {
        const camelCaseItem = convertKeysToCamelCase(item as Record<string, unknown>);
        // Use less restrictive deserialization to preserve nested JSONB structures
        return plainToInstance(entityClass, camelCaseItem, {
          strategy: 'exposeAll',
          excludeExtraneousValues: false,
          enableImplicitConversion: true,
        });
      }
      throw new Error(`Invalid item at index ${index}`);
    } catch (error) {
      throw new Error(`Array deserialization failed at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Convert plain object to entity instance for serialization purposes
 * This creates an entity with proper @Expose decorators from a plain object
 */
export function toEntityInstance<T>(entityClass: new () => T, data: Record<string, unknown>): T {
  if (!entityClass || typeof entityClass !== 'function') {
    throw new Error('Invalid entity class provided');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Data must be a valid object');
  }

  return plainToInstance(entityClass, data, {
    enableImplicitConversion: false,
    excludeExtraneousValues: false, // Allow all properties initially
  });
}

/**
 * Standardized method to serialize entities to database format
 * Replaces toDatabaseFormat instance methods on entities
 * Automatically converts camelCase to snake_case for PostgreSQL
 */
export function toDatabase(entity: unknown): Record<string, unknown> {
  if (!entity || typeof entity !== 'object') {
    throw new Error('Entity must be a valid object for serialization');
  }

  // Use instanceToPlain to convert entity to plain object
  // Key: don't filter nested properties - PostgreSQL JSONB handles objects directly
  // exposeUnsetFields: false prevents undefined from being serialized
  const serialized = instanceToPlain(entity, {
    exposeUnsetFields: false,
    enableCircularCheck: true,
  });

  // Fail fast if serialization produces no result
  if (!serialized || typeof serialized !== 'object') {
    throw new Error(`Serialization failed for entity: ${entity.constructor?.name || 'Unknown'}`);
  }

  // Remove undefined properties
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(serialized)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  // Fail fast if no properties to serialize
  if (Object.keys(result).length === 0) {
    throw new Error(`No properties to serialize in entity: ${entity.constructor?.name || 'Unknown'}`);
  }

  // Convert camelCase keys to snake_case for PostgreSQL compatibility
  return convertKeysToSnakeCase(result);
}
