/**
 * Professional serialization utilities using class-transformer
 * Provides reusable serialize/deserialize methods for common patterns across repositories
 */

import { classToPlain, plainToClass, Transform } from 'class-transformer';
import 'reflect-metadata';

/**
 * Common transformation decorators for model properties
 */
export const Transformers = {
  /**
   * Transform JSON string to object and vice versa
   */
  JsonTransform: () =>
    Transform(({ value, type }) => {
      if (type === 0) {
        // toClassOnly (deserializing from database)
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        }
        return value;
      } else {
        // toPlainOnly (serializing to database)
        if (value !== null && value !== undefined) {
          try {
            return JSON.stringify(value);
          } catch {
            return null;
          }
        }
        return null;
      }
    }),

  /**
   * Transform date string to Date object and vice versa
   */
  DateTransform: () =>
    Transform(({ value, type }) => {
      if (type === 0) {
        // toClassOnly (deserializing)
        return value ? new Date(value) : null;
      } else {
        // toPlainOnly (serializing)
        return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
      }
    }),

  /**
   * Ensure array type with default empty array
   */
  ArrayTransform: (defaultValue: any[] = []) =>
    Transform(({ value }) => {
      if (Array.isArray(value)) return value;
      if (value === null || value === undefined) return defaultValue;
      return defaultValue;
    }),

  /**
   * Transform number with default value
   */
  NumberTransform: (defaultValue: number = 0) =>
    Transform(({ value }) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    }),

  /**
   * Transform boolean with default value
   */
  BooleanTransform: (defaultValue: boolean = false) =>
    Transform(({ value }) => {
      if (typeof value === 'boolean') return value;
      if (value === null || value === undefined) return defaultValue;
      return Boolean(value);
    }),
};

/**
 * Base serializable model class that other models can extend
 */
export abstract class SerializableModel {
  /**
   * Convert this instance to database format
   */
  toDatabase(): Record<string, any> {
    return classToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Create instance from database data
   */
  static fromDatabase<T extends SerializableModel>(this: new (...args: any[]) => T, data: Record<string, any>): T {
    return plainToClass(this, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }
}

/**
 * Model serialization utilities
 */
export class ModelSerializer {
  /**
   * Serialize model data for database storage using class-transformer
   */
  static serialize<T>(data: T, modelClass?: new (...args: any[]) => T): Record<string, any> {
    if (modelClass) {
      const instance = plainToClass(modelClass, data);
      return classToPlain(instance, {
        strategy: 'excludeAll',
        excludeExtraneousValues: true,
      });
    }

    // Fallback for plain objects - handle common transformations
    return this.serializePlainObject(data as Record<string, any>);
  }

  /**
   * Deserialize model data from database storage using class-transformer
   */
  static deserialize<T>(data: Record<string, any>, modelClass: new (...args: any[]) => T): T {
    return plainToClass(modelClass, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Fallback serialization for plain objects (backward compatibility)
   */
  private static serializePlainObject(data: Record<string, any>): Record<string, any> {
    const serialized = { ...data };

    // Handle common transformations for backward compatibility
    for (const [key, value] of Object.entries(serialized)) {
      // JSON objects/arrays to strings
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        serialized[key] = JSON.stringify(value);
      }
      // Dates to ISO strings
      else if (value instanceof Date) {
        serialized[key] = value.toISOString();
      }
      // Ensure arrays are preserved
      else if (Array.isArray(value)) {
        serialized[key] = value;
      }
    }

    return serialized;
  }

  /**
   * Helper method to safely parse JSON with fallback
   */
  static safeJsonParse<T>(jsonString: string | null | undefined, fallback: T): T {
    if (!jsonString || typeof jsonString !== 'string') {
      return fallback;
    }

    try {
      const parsed = JSON.parse(jsonString);
      return parsed !== null ? parsed : fallback;
    } catch (error) {
      console.warn('JSON parse error:', error);
      return fallback;
    }
  }

  /**
   * Helper method to safely stringify JSON
   */
  static safeJsonStringify(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      console.warn('JSON stringify error:', error);
      return null;
    }
  }

  /**
   * Helper to ensure safe value with default fallback
   */
  static getSafeValue<T>(value: T | {} | null | undefined, defaultValue: T): T {
    if (value === null || value === undefined || (typeof value === 'object' && Object.keys(value as any).length === 0)) {
      return defaultValue;
    }
    return value as T;
  }
}

/**
 * Example model classes showing how to use decorators
 * These can be moved to protocol package later
 */

// Example Session Model with decorators
export class SessionExample extends SerializableModel {
  @Transform(({ value }) => value)
  id!: string;

  @Transformers.DateTransform()
  createdAt!: Date;

  @Transformers.DateTransform()
  updatedAt?: Date;

  @Transformers.DateTransform()
  lastActivityAt?: Date;

  @Transformers.NumberTransform(0)
  messageCount!: number;

  @Transformers.NumberTransform(0)
  totalTokens!: number;

  @Transform(({ value }) => value || 'active')
  status!: string;

  @Transformers.JsonTransform()
  metadata?: any;
}

// Example Workflow Model with decorators
export class WorkflowExample extends SerializableModel {
  @Transform(({ value }) => value)
  id!: string;

  @Transform(({ value }) => value)
  name!: string;

  @Transformers.DateTransform()
  createdAt!: Date;

  @Transformers.DateTransform()
  updatedAt!: Date;

  @Transform(({ value }) => value)
  authorId!: string;

  @Transform(({ value }) => value)
  starshipId?: string;

  @Transformers.JsonTransform()
  blueprint?: any;

  @Transformers.ArrayTransform([])
  tags!: string[];

  @Transformers.ArrayTransform([])
  allowedStarshipClasses!: string[];

  @Transformers.NumberTransform(30000)
  timeout!: number;

  @Transformers.NumberTransform(0)
  usageCount!: number;

  @Transformers.BooleanTransform(false)
  isPublic!: boolean;

  @Transform(({ value }) => value || '1.0.0')
  version!: string;

  @Transform(({ value }) => value || 'workflow')
  executionMode!: string;
}

export { Transform, Type } from 'class-transformer';
