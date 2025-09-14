/**
 * Entity Test Helper Utilities
 *
 * Provides common test utilities and patterns for entity testing,
 * specifically focused on serialization, deserialization, and validation.
 */

import { fromDatabase, toDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';

/**
 * Common test data patterns for entities
 */
export interface EntityTestData {
  valid: Record<string, unknown>;
  invalid: Array<{
    data: Record<string, unknown>;
    expectedError: string;
    description: string;
  }>;
  transformations: Array<{
    input: Record<string, unknown>;
    expected: Record<string, unknown>;
    description: string;
  }>;
}

/**
 * Base entity test suite helper
 */
export class EntityTestHelper<T> {
  constructor(
    private entityClass: new () => T,
    private entityName: string
  ) {}

  /**
   * Test serialization (entity to database format)
   */
  async testSerialization(testCases: Array<{ entity: T; expectedFields?: string[]; description: string }>) {
    const results = [];

    for (const testCase of testCases) {
      const serialized = toDatabase(testCase.entity);

      results.push({
        description: testCase.description,
        serialized,
        hasRequiredFields: testCase.expectedFields
          ? testCase.expectedFields.every((field) => Object.prototype.hasOwnProperty.call(serialized, field))
          : true,
        isPlainObject: typeof serialized === 'object' && serialized !== null,
      });
    }

    return results;
  }

  /**
   * Test deserialization (database format to entity)
   */
  async testDeserialization(testCases: Array<{ data: Record<string, unknown>; description: string }>) {
    const results = [];

    for (const testCase of testCases) {
      try {
        const entity = fromDatabase(this.entityClass, testCase.data);
        const isEntityInstance = entity instanceof this.entityClass;

        results.push({
          description: testCase.description,
          success: true,
          entity,
          isEntityInstance,
          error: null,
        });
      } catch (error) {
        results.push({
          description: testCase.description,
          success: false,
          entity: null,
          isEntityInstance: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Test array deserialization
   */
  async testArrayDeserialization(testCases: Array<{ dataArray: Record<string, unknown>[]; description: string }>) {
    const results = [];

    for (const testCase of testCases) {
      try {
        const entities = fromDatabaseArray(this.entityClass, testCase.dataArray);
        const allAreInstances = entities.every((entity) => entity instanceof this.entityClass);

        results.push({
          description: testCase.description,
          success: true,
          entities,
          count: entities.length,
          allAreInstances,
          error: null,
        });
      } catch (error) {
        results.push({
          description: testCase.description,
          success: false,
          entities: [],
          count: 0,
          allAreInstances: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Test validation using the entity's static validate method
   */
  async testValidation(
    testCases: Array<{
      data: Record<string, unknown>;
      operation?: 'create' | 'update';
      shouldPass: boolean;
      expectedErrors?: string[];
      description: string;
    }>
  ) {
    const results = [];

    for (const testCase of testCases) {
      try {
        // Use the entity's static validate method if available
        const EntityClass = this.entityClass as unknown as { validate?: (data: unknown, operation?: 'create' | 'update') => Promise<void> };

        if (EntityClass.validate) {
          await EntityClass.validate(testCase.data, testCase.operation || 'create');

          results.push({
            description: testCase.description,
            passed: true, // Validation succeeded
            error: null,
            validationSuccess: true,
          });
        } else {
          // Fallback to class-validator direct validation
          const entity = plainToInstance(this.entityClass, testCase.data);
          const errors = await validate(entity as object, {
            skipMissingProperties: testCase.operation === 'update',
            whitelist: true,
            forbidNonWhitelisted: true,
          });

          const hasErrors = errors.length > 0;

          results.push({
            description: testCase.description,
            passed: testCase.shouldPass === !hasErrors,
            error: hasErrors ? errors.map((e) => Object.values(e.constraints || {}).join(', ')).join('; ') : null,
            validationSuccess: !hasErrors,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        results.push({
          description: testCase.description,
          passed: false, // Validation failed
          error: errorMessage,
          validationSuccess: false,
        });
      }
    }

    return results;
  }

  /**
   * Test round-trip serialization/deserialization
   */
  async testRoundTrip(testCases: Array<{ data: Record<string, unknown>; description: string }>) {
    const results = [];

    for (const testCase of testCases) {
      try {
        // Database -> Entity -> Database
        const entity = fromDatabase(this.entityClass, testCase.data);
        const serializedBack = toDatabase(entity);

        results.push({
          description: testCase.description,
          success: true,
          originalData: testCase.data,
          entity,
          serializedBack,
          keysMatch: this.compareKeys(testCase.data, serializedBack),
        });
      } catch (error) {
        results.push({
          description: testCase.description,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Test transformations work correctly
   */
  async testTransformations(
    testCases: Array<{
      input: Record<string, unknown>;
      expected: Partial<T>;
      description: string;
    }>
  ) {
    const results = [];

    for (const testCase of testCases) {
      try {
        const entity = fromDatabase(this.entityClass, testCase.input);

        // Check if transformations worked as expected
        const transformationsCorrect = Object.entries(testCase.expected).every(([key, expectedValue]) => {
          const actualValue = (entity as unknown as Record<string, unknown>)[key];
          return this.deepEqual(actualValue, expectedValue);
        });

        results.push({
          description: testCase.description,
          success: transformationsCorrect,
          entity,
          expected: testCase.expected,
          transformationsCorrect,
        });
      } catch (error) {
        results.push({
          description: testCase.description,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Utility to compare object keys (ignoring order)
   */
  private compareKeys(obj1: Record<string, unknown>, obj2: Record<string, unknown>): boolean {
    const keys1 = Object.keys(obj1).sort();
    const keys2 = Object.keys(obj2).sort();
    return keys1.length === keys2.length && keys1.every((key, index) => key === keys2[index]);
  }

  /**
   * Deep equality check for comparing values
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((item, index) => this.deepEqual(item, b[index]));
    }

    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      const keysA = Object.keys(a as Record<string, unknown>);
      const keysB = Object.keys(b as Record<string, unknown>);

      if (keysA.length !== keysB.length) return false;

      return keysA.every((key) => {
        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;
        return this.deepEqual(aObj[key], bObj[key]);
      });
    }

    return false;
  }
}

/**
 * Common test data generators
 */
export const CommonTestData = {
  /**
   * Generate test dates
   */
  dates: {
    valid: ['2024-01-01T00:00:00.000Z', '2023-12-25T15:30:45.123Z', new Date().toISOString()],
    invalid: [
      'invalid-date',
      '2024-13-01', // Invalid month
      '2024-01-32', // Invalid day
      '',
      null,
      undefined,
    ],
  },

  /**
   * Generate test strings
   */
  strings: {
    valid: ['test', 'hello world', 'a'.repeat(100)],
    tooShort: '',
    tooLong: 'a'.repeat(1000),
    invalid: [null, undefined, 123, {}],
  },

  /**
   * Generate test objects
   */
  objects: {
    valid: [{}, { key: 'value' }, { nested: { key: 'value' } }],
    invalid: ['string', 123, null],
  },

  /**
   * Generate test arrays
   */
  arrays: {
    valid: [[], ['item1'], [{ key: 'value' }]],
    invalid: ['string', 123, null, {}],
  },
};

/**
 * Jest matcher helpers
 */
export const EntityMatchers = {
  /**
   * Check if an object is a valid entity instance
   */
  toBeValidEntity: (received: unknown, EntityClass: new () => unknown) => {
    const pass = received instanceof EntityClass;

    if (pass) {
      return {
        message: () => `expected ${received} not to be an instance of ${EntityClass.name}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be an instance of ${EntityClass.name}`,
        pass: false,
      };
    }
  },

  /**
   * Check if serialization/deserialization preserves data integrity
   */
  toPreserveDataIntegrity: (original: Record<string, unknown>, processed: Record<string, unknown>) => {
    // Check that essential fields are preserved
    const essentialFieldsPreserved = ['id', 'createdAt', 'updatedAt'].every((field) => {
      if (original[field] !== undefined) {
        return processed[field] !== undefined;
      }
      return true;
    });

    const pass = essentialFieldsPreserved;

    if (pass) {
      return {
        message: () => `expected data integrity not to be preserved`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected data integrity to be preserved`,
        pass: false,
      };
    }
  },
};
