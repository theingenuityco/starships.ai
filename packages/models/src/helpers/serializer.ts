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
