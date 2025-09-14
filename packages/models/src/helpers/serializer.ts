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
   * Transform JSON string to object and vice versa - fails on invalid JSON
   */
  JsonTransform: () =>
    Transform(({ value, type }) => {
      if (type === 0) {
        // toClassOnly (deserializing from database)
        if (typeof value === 'string') {
          return JSON.parse(value); // Let JSON.parse throw on invalid JSON
        }
        return value;
      } else {
        // toPlainOnly (serializing to database)
        if (value !== null && value !== undefined) {
          return JSON.stringify(value); // Let JSON.stringify throw on circular refs
        }
        return null;
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
        if (value === null || value === undefined) return null;
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
        if (value === null || value === undefined) return null;
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
   * Transform temperature with strict validation - must be between 0 and 2
   */
  TemperatureTransform: () => {
    return Transform(({ value }) => {
      if (value == null || value === undefined) return null;

      const temp = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(temp)) {
        throw new Error(`Invalid temperature value: ${value}`);
      }

      if (temp < 0 || temp > 2) {
        throw new Error(`Temperature must be between 0 and 2, got: ${temp}`);
      }

      return temp;
    });
  },

  /**
   * Transform maxTokens with strict validation - must be positive integer
   */
  MaxTokensTransform: () => {
    return Transform(({ value }) => {
      if (value == null || value === undefined) return null;

      const tokens = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(tokens) || !Number.isInteger(tokens)) {
        throw new Error(`Invalid maxTokens value: ${value}`);
      }

      if (tokens < 1) {
        throw new Error(`maxTokens must be positive, got: ${tokens}`);
      }

      if (tokens > 100000) {
        throw new Error(`maxTokens exceeds maximum limit of 100000, got: ${tokens}`);
      }

      return tokens;
    });
  },

  /**
   * Transform timeout with strict validation - must be positive integer in milliseconds
   */
  TimeoutTransform: () => {
    return Transform(({ value }) => {
      if (value == null || value === undefined) return null;

      const timeout = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(timeout) || !Number.isInteger(timeout)) {
        throw new Error(`Invalid timeout value: ${value}`);
      }

      if (timeout < 1000) {
        throw new Error(`Timeout must be at least 1000ms (1 second), got: ${timeout}`);
      }

      if (timeout > 300000) {
        throw new Error(`Timeout exceeds maximum limit of 300000ms (5 minutes), got: ${timeout}`);
      }

      return timeout;
    });
  },
};
