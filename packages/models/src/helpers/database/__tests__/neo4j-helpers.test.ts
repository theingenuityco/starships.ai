/**
 * Neo4j Helpers Unit Tests
 */

import { Integer, int } from 'neo4j-driver';
import {
  convertNeo4jInt,
  convertNeo4jIntsInObject,
  convertNeo4jIntsInArray,
  isNeo4jInt,
} from '../neo4j-helpers';

describe('Neo4j Helpers', () => {
  describe('convertNeo4jInt', () => {
    it('should convert Neo4j Integer to JavaScript number', () => {
      const neo4jInt = int(42);
      const result = convertNeo4jInt(neo4jInt);

      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should return JavaScript number unchanged', () => {
      const number = 123;
      const result = convertNeo4jInt(number);

      expect(result).toBe(123);
      expect(typeof result).toBe('number');
    });

    it('should convert valid string numbers', () => {
      expect(convertNeo4jInt('456')).toBe(456);
      expect(convertNeo4jInt('0')).toBe(0);
      expect(convertNeo4jInt('-123')).toBe(-123);
    });

    it('should return 0 for invalid string numbers', () => {
      expect(convertNeo4jInt('abc')).toBe(0);
      expect(convertNeo4jInt('12.34abc')).toBe(0);
      expect(convertNeo4jInt('')).toBe(0);
    });

    it('should return 0 for non-numeric types', () => {
      expect(convertNeo4jInt(null)).toBe(0);
      expect(convertNeo4jInt(undefined)).toBe(0);
      expect(convertNeo4jInt({})).toBe(0);
      expect(convertNeo4jInt([])).toBe(0);
      expect(convertNeo4jInt(true)).toBe(0);
    });

    it('should handle large Neo4j integers', () => {
      const largeInt = int(Number.MAX_SAFE_INTEGER); // Max safe integer
      const result = convertNeo4jInt(largeInt);

      expect(typeof result).toBe('number');
      expect(result).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle negative Neo4j integers', () => {
      const negativeInt = int(-456);
      const result = convertNeo4jInt(negativeInt);

      expect(result).toBe(-456);
    });
  });

  describe('isNeo4jInt', () => {
    it('should return true for Neo4j Integer objects', () => {
      const neo4jInt = int(42);
      expect(isNeo4jInt(neo4jInt)).toBe(true);
    });

    it('should return false for JavaScript numbers', () => {
      expect(isNeo4jInt(42)).toBe(false);
      expect(isNeo4jInt(0)).toBe(false);
      expect(isNeo4jInt(-123)).toBe(false);
    });

    it('should return false for other types', () => {
      expect(isNeo4jInt('123')).toBe(false);
      expect(isNeo4jInt(null)).toBe(false);
      expect(isNeo4jInt(undefined)).toBe(false);
      expect(isNeo4jInt({})).toBe(false);
      expect(isNeo4jInt([])).toBe(false);
      expect(isNeo4jInt(true)).toBe(false);
    });
  });

  describe('convertNeo4jIntsInObject', () => {
    it('should convert Neo4j integers in simple object', () => {
      const input = {
        id: 'test-id',
        count: int(42),
        name: 'test',
        active: true,
      };

      const result = convertNeo4jIntsInObject(input);

      expect(result).toEqual({
        id: 'test-id',
        count: 42,
        name: 'test',
        active: true,
      });
    });

    it('should handle nested objects with Neo4j integers', () => {
      const input = {
        user: {
          id: 'user-123',
          age: int(25),
          profile: {
            score: int(100),
            name: 'John',
          },
        },
        metadata: {
          version: int(1),
        },
      };

      const result = convertNeo4jIntsInObject(input);

      expect(result).toEqual({
        user: {
          id: 'user-123',
          age: 25,
          profile: {
            score: 100,
            name: 'John',
          },
        },
        metadata: {
          version: 1,
        },
      });
    });

    it('should handle arrays with Neo4j integers', () => {
      const input = {
        numbers: [int(1), int(2), int(3)],
        mixed: [int(42), 'text', true, { count: int(5) }],
      };

      const result = convertNeo4jIntsInObject(input);

      expect(result).toEqual({
        numbers: [1, 2, 3],
        mixed: [42, 'text', true, { count: 5 }],
      });
    });

    it('should return non-objects unchanged', () => {
      expect(convertNeo4jIntsInObject(null)).toBe(null);
      expect(convertNeo4jIntsInObject(undefined)).toBe(undefined);
      expect(convertNeo4jIntsInObject('string')).toBe('string');
      expect(convertNeo4jIntsInObject(42)).toBe(42);
      expect(convertNeo4jIntsInObject(true)).toBe(true);
    });

    it('should handle empty objects', () => {
      const result = convertNeo4jIntsInObject({});
      expect(result).toEqual({});
    });

    it('should handle arrays of primitive Neo4j integers', () => {
      const input = {
        scores: [int(10), int(20), int(30)],
      };

      const result = convertNeo4jIntsInObject(input);

      expect(result).toEqual({
        scores: [10, 20, 30],
      });
    });

    it('should handle deeply nested structures', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              value: int(999),
              array: [int(1), { nested: int(2) }],
            },
          },
        },
      };

      const result = convertNeo4jIntsInObject(input);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              value: 999,
              array: [1, { nested: 2 }],
            },
          },
        },
      });
    });

    it('should preserve non-integer values in mixed arrays', () => {
      const input = {
        mixed: [
          int(42),
          'string',
          null,
          undefined,
          { id: 'test', count: int(5) },
          [int(1), int(2)],
        ],
      };

      const result = convertNeo4jIntsInObject(input);

      expect(result).toEqual({
        mixed: [42, 'string', null, undefined, { id: 'test', count: 5 }, [1, 2]],
      });
    });
  });

  describe('convertNeo4jIntsInArray', () => {
    it('should convert Neo4j integers in array of objects', () => {
      const input = [
        { id: 'item1', count: int(10) },
        { id: 'item2', count: int(20) },
        { id: 'item3', count: int(30) },
      ];

      const result = convertNeo4jIntsInArray(input);

      expect(result).toEqual([
        { id: 'item1', count: 10 },
        { id: 'item2', count: 20 },
        { id: 'item3', count: 30 },
      ]);
    });

    it('should handle empty array', () => {
      const result = convertNeo4jIntsInArray([]);
      expect(result).toEqual([]);
    });

    it('should handle array with mixed object types', () => {
      const input = [
        { simple: int(1) },
        {
          nested: {
            deep: int(2),
            array: [int(3), int(4)],
          },
        },
        { string: 'value', boolean: true },
      ];

      const result = convertNeo4jIntsInArray(input);

      expect(result).toEqual([
        { simple: 1 },
        {
          nested: {
            deep: 2,
            array: [3, 4],
          },
        },
        { string: 'value', boolean: true },
      ]);
    });

    it('should handle objects with null and undefined values', () => {
      const input = [{ id: 'test', count: int(5), nullable: null, undefined: undefined }];

      const result = convertNeo4jIntsInArray(input);

      expect(result).toEqual([{ id: 'test', count: 5, nullable: null, undefined: undefined }]);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle circular reference prevention', () => {
      const obj: any = { id: int(1) };
      obj.self = obj; // Create circular reference

      // Should not throw, but may not handle circular reference perfectly
      expect(() => convertNeo4jIntsInObject(obj)).not.toThrow();
    });

    it('should handle very large integers safely', () => {
      const maxSafeInt = int(Number.MAX_SAFE_INTEGER);
      const result = convertNeo4jInt(maxSafeInt);

      expect(typeof result).toBe('number');
      expect(result).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle zero values correctly', () => {
      const zero = int(0);
      expect(convertNeo4jInt(zero)).toBe(0);

      const obj = { count: int(0), active: false };
      const result = convertNeo4jIntsInObject(obj);
      expect(result.count).toBe(0);
      expect(result.active).toBe(false);
    });

    it('should handle arrays with null elements', () => {
      const input = {
        items: [int(1), null, int(2), undefined, int(3)],
      };

      const result = convertNeo4jIntsInObject(input);

      expect(result).toEqual({
        items: [1, null, 2, undefined, 3],
      });
    });
  });
});
