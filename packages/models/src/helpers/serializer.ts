/**
 * Professional serialization utilities using class-transformer
 * Provides reusable serialize/deserialize methods for common patterns across repositories
 */

import { Transform } from 'class-transformer';
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
   * Transform date to ensure ISO string format for entities
   */
  DateTransform: () =>
    Transform(({ value, type }) => {
      if (type === 0) {
        // toClassOnly (deserializing) - keep as ISO string for entities
        if (value === null || value === undefined) return null;
        if (!value) return null;
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'string') {
          // Handle potential non-ISO string dates by converting through Date
          try {
            const date = new Date(value);
            return date.toISOString();
          } catch {
            return value; // If conversion fails, return original
          }
        }
        // Handle other types (numbers, etc.)
        try {
          return new Date(value).toISOString();
        } catch {
          return null;
        }
      } else {
        // toPlainOnly (serializing)
        if (value === null || value === undefined) return null;
        if (!value) return null;
        return value instanceof Date ? value.toISOString() : value;
      }
    }),

  /**
   * Ensure array type with default empty array
   */
  ArrayTransform: (defaultValue: unknown[] = []) =>
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

export const LLMTransformers = {
  /**
   * Transform temperature to ensure proper range
   */
  TemperatureTransform: () => {
    return Transform(({ value }) => {
      if (value == null) return undefined;
      const temp = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(temp)) return undefined;
      return Math.max(0, Math.min(2, temp)); // Clamp between 0 and 2
    });
  },

  /**
   * Transform maxTokens to ensure it's a positive integer
   */
  MaxTokensTransform: () => {
    return Transform(({ value }) => {
      if (value == null) return undefined;
      const tokens = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(tokens) || tokens < 1) return undefined;
      return Math.min(tokens, 100000); // Reasonable upper limit
    });
  },

  /**
   * Transform timeout to ensure it's a positive integer (milliseconds)
   */
  TimeoutTransform: () => {
    return Transform(({ value }) => {
      if (value == null) return 30000; // Default 30 seconds
      const timeout = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(timeout) || timeout < 1000) return 30000; // Minimum 1 second
      return Math.min(timeout, 300000); // Maximum 5 minutes
    });
  },
};
