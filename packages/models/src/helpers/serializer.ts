/**
 * Professional serialization utilities using class-transformer
 * Provides reusable serialize/deserialize methods for common patterns across repositories
 */

import { Transform } from 'class-transformer';
import 'reflect-metadata';

/**
 * Common transformation decorators for model properties
 * Strict transformers that fail fast instead of using fallback values
 */
export const Transformers = {
  /**
   * Transform JSON string to object and vice versa - lean and strict
   */
  JsonTransform: () =>
    Transform(({ value, type }) => {
      if (type === 0) {
        // toClassOnly (deserializing from database) - parse strings only
        if (typeof value === 'string') {
          return JSON.parse(value); // Let JSON.parse throw on invalid JSON
        }
        return value; // Pass through non-strings as-is
      } else {
        // toPlainOnly (serializing to database) - stringify everything
        return JSON.stringify(value); // Let JSON.stringify throw on circular refs
      }
    }),

  /**
   * Transform date to ensure consistent ISO string format
   * Fails fast on invalid dates instead of returning fallbacks
   */
  DateTransform: () =>
    Transform(({ value, type }) => {
      if (type === 0) {
        // toClassOnly (deserializing) - ensure consistent ISO string format
        if (value === null || value === undefined) return undefined;
        if (value instanceof Date) {
          if (isNaN(value.getTime())) {
            throw new Error('Invalid Date object encountered during deserialization');
          }
          return value.toISOString();
        }
        if (typeof value === 'string') {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw new Error(`Invalid date string: ${value}`);
          }
          return date.toISOString();
        }
        // Handle numbers (timestamps)
        if (typeof value === 'number') {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw new Error(`Invalid timestamp: ${value}`);
          }
          return date.toISOString();
        }
        throw new Error(`Unsupported date value type: ${typeof value}`);
      } else {
        // toPlainOnly (serializing)
        if (value === null || value === undefined) return undefined;
        if (value instanceof Date) {
          if (isNaN(value.getTime())) {
            throw new Error('Invalid Date object encountered during serialization');
          }
          return value.toISOString();
        }
        if (typeof value === 'string') {
          // Validate that string is a valid ISO date
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw new Error(`Invalid date string during serialization: ${value}`);
          }
          return value;
        }
        throw new Error(`Unsupported date value for serialization: ${typeof value}`);
      }
    }),

  /**
   * Strict array transformer - fails if value is not an array when expected
   */
  ArrayTransform: () =>
    Transform(({ value }) => {
      if (value === null || value === undefined) return null;
      if (Array.isArray(value)) return value;
      throw new Error(`Expected array but received: ${typeof value}`);
    }),

  /**
   * Strict number transformer - fails on invalid numbers
   */
  NumberTransform: () =>
    Transform(({ value }) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') {
        if (isNaN(value) || !isFinite(value)) {
          throw new Error(`Invalid number value: ${value}`);
        }
        return value;
      }
      if (typeof value === 'string') {
        const num = Number(value);
        if (isNaN(num) || !isFinite(num)) {
          throw new Error(`Cannot convert string to number: ${value}`);
        }
        return num;
      }
      throw new Error(`Cannot transform value to number: ${typeof value}`);
    }),

  /**
   * Strict boolean transformer - fails on ambiguous values
   */
  BooleanTransform: () =>
    Transform(({ value }) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'boolean') return value;
      // Allow explicit string representations
      if (typeof value === 'string') {
        if (value === 'true') return true;
        if (value === 'false') return false;
        throw new Error(`Cannot convert string to boolean: ${value}`);
      }
      // Allow explicit numeric representations
      if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        throw new Error(`Cannot convert number to boolean: ${value}`);
      }
      throw new Error(`Cannot transform value to boolean: ${typeof value}`);
    }),
};

export const LLMTransformers = {
  /**
   * Transform temperature with validation - throws for invalid values, clamps range
   */
  TemperatureTransform: () => {
    return Transform(({ value }) => {
      if (value == null || value === undefined) return null;

      const temp = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(temp)) {
        throw new Error(`Invalid temperature value: ${value}`);
      }

      // Clamp temperature to valid range (0-2)
      return Math.max(0, Math.min(2, temp));
    });
  },

  /**
   * Transform maxTokens with validation - returns undefined for invalid values
   */
  MaxTokensTransform: () => {
    return Transform(({ value }) => {
      if (value == null || value === undefined) return undefined;

      const tokens = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(tokens) || !Number.isInteger(tokens)) {
        return undefined;
      }

      if (tokens < 1) {
        return undefined;
      }

      // Clamp maxTokens to reasonable limit
      return Math.min(100000, tokens);
    });
  },

  /**
   * Transform timeout with validation - returns default for invalid values
   */
  TimeoutTransform: () => {
    return Transform(({ value }) => {
      if (value == null || value === undefined) return 30000;

      const timeout = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(timeout) || !Number.isInteger(timeout)) {
        return 30000;
      }

      // Return default for values below minimum
      if (timeout < 1000) {
        return 30000;
      }

      // Clamp timeout to reasonable limits
      return Math.min(300000, timeout);
    });
  },
};
