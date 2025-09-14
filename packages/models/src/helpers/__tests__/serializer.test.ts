/**
 * Serializer/Transformer Unit Tests
 *
 * Tests for the common transformation decorators and utilities
 * used across entities for data transformation.
 */

import { Transformers, LLMTransformers } from '@/helpers/serializer';
import { plainToInstance, instanceToPlain, Expose } from 'class-transformer';
import 'reflect-metadata';

// Test entity classes to test transformations in real scenarios
class JsonTestEntity {
  @Expose()
  @Transformers.JsonTransform()
  data?: Record<string, unknown>;

  @Expose()
  @Transformers.JsonTransform()
  metadata?: unknown;
}

class DateTestEntity {
  @Expose()
  @Transformers.DateTransform()
  createdAt?: string;

  @Expose()
  @Transformers.DateTransform()
  updatedAt?: string;
}

class ArrayTestEntity {
  @Expose()
  @Transformers.ArrayTransform()
  testArray?: unknown[];
}

class NumberTestEntity {
  @Expose()
  @Transformers.NumberTransform()
  testNumber?: number;
}

class BooleanTestEntity {
  @Expose()
  @Transformers.BooleanTransform()
  testBoolean?: boolean;
}

class LLMTestEntity {
  @Expose()
  @LLMTransformers.TemperatureTransform()
  temperature?: number;

  @Expose()
  @LLMTransformers.MaxTokensTransform()
  maxTokens?: number;

  @Expose()
  @LLMTransformers.TimeoutTransform()
  timeout?: number;
}

describe('Transformers', () => {
  describe('JsonTransform', () => {
    it('should parse JSON strings to objects during deserialization', () => {
      const plain = {
        data: '{"key": "value", "number": 42}',
        metadata: '{"nested": {"deep": "value"}}',
      };
      const instance = plainToInstance(JsonTestEntity, plain);

      expect(instance.data).toEqual({ key: 'value', number: 42 });
      expect(instance.metadata).toEqual({ nested: { deep: 'value' } });
    });

    it('should stringify objects to JSON during serialization', () => {
      const instance = new JsonTestEntity();
      instance.data = { key: 'value', number: 42 };
      instance.metadata = { nested: { deep: 'value' } };

      const plain = instanceToPlain(instance);

      expect(plain.data).toBe('{"key":"value","number":42}');
      expect(plain.metadata).toBe('{"nested":{"deep":"value"}}');
    });

    it('should handle invalid JSON gracefully during deserialization', () => {
      const plain = {
        data: 'invalid-json{',
        metadata: '{"incomplete": json}',
      };
      const instance = plainToInstance(JsonTestEntity, plain);

      expect(instance.data).toBeNull();
      expect(instance.metadata).toBeNull();
    });

    it('should handle null and undefined values', () => {
      const plainNull = { data: null, metadata: undefined };
      const instance = plainToInstance(JsonTestEntity, plainNull);

      expect(instance.data).toBeNull();
      expect(instance.metadata).toBeUndefined();

      // Test serialization of null values
      const instanceForSerialization = new JsonTestEntity();
      instanceForSerialization.data = undefined;
      instanceForSerialization.metadata = undefined;

      const serialized = instanceToPlain(instanceForSerialization);
      expect(serialized.data).toBeNull();
    });

    it('should preserve non-string values during deserialization', () => {
      const objectValue = { already: 'parsed' };
      const plain = { data: objectValue };

      const instance = plainToInstance(JsonTestEntity, plain);

      expect(instance.data).toEqual(objectValue);
    });

    it('should handle round-trip transformations correctly', () => {
      const originalData = {
        string: 'test',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { deep: { value: 'nested' } },
        nullValue: null,
      };

      // Create instance and serialize
      const instance = new JsonTestEntity();
      instance.data = originalData;

      const serialized = instanceToPlain(instance);
      expect(typeof serialized.data).toBe('string');

      // Deserialize back
      const deserialized = plainToInstance(JsonTestEntity, serialized);
      expect(deserialized.data).toEqual(originalData);
    });
  });

  describe('DateTransform', () => {
    it('should preserve ISO date strings during deserialization', () => {
      const dateString = '2024-01-01T00:00:00.000Z';
      const plain = {
        createdAt: dateString,
        updatedAt: '2024-01-02T12:30:45.123Z',
      };

      const instance = plainToInstance(DateTestEntity, plain);

      expect(instance.createdAt).toBe(dateString);
      expect(instance.updatedAt).toBe('2024-01-02T12:30:45.123Z');
      expect(typeof instance.createdAt).toBe('string');
      expect(typeof instance.updatedAt).toBe('string');
    });

    it('should convert Date objects to ISO strings during both serialization and deserialization', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');

      // Test deserialization of Date objects
      const plainWithDate = { createdAt: date };
      const instance = plainToInstance(DateTestEntity, plainWithDate);
      expect(instance.createdAt).toBe('2024-01-01T00:00:00.000Z');

      // Test serialization
      const instance2 = new DateTestEntity();
      instance2.createdAt = '2024-01-01T00:00:00.000Z';
      instance2.updatedAt = '2024-01-02T12:30:45.123Z';

      const plain = instanceToPlain(instance2);

      expect(plain.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(plain.updatedAt).toBe('2024-01-02T12:30:45.123Z');
    });

    it('should handle null and undefined values', () => {
      const plain = { createdAt: null, updatedAt: undefined };
      const instance = plainToInstance(DateTestEntity, plain);

      expect(instance.createdAt).toBeNull();
      expect(instance.updatedAt).toBeNull(); // Transform converts undefined to null
    });

    it('should handle timestamp numbers by converting to ISO strings', () => {
      const timestamp = 1704067200000; // 2024-01-01T00:00:00.000Z
      const plain = { createdAt: timestamp };

      const instance = plainToInstance(DateTestEntity, plain);

      expect(instance.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(typeof instance.createdAt).toBe('string');
    });
  });

  describe('ArrayTransform', () => {
    it('should preserve arrays', () => {
      const array = [1, 2, 3];
      const plain = { testArray: array };

      const instance = plainToInstance(ArrayTestEntity, plain);

      expect(instance.testArray).toEqual(array);
    });

    it('should handle null and undefined values', () => {
      const plainNull = { testArray: null };
      const plainUndefined = { testArray: undefined };

      const instanceNull = plainToInstance(ArrayTestEntity, plainNull);
      const instanceUndefined = plainToInstance(ArrayTestEntity, plainUndefined);

      expect(instanceNull.testArray).toBeNull();
      expect(instanceUndefined.testArray).toBeNull();
    });

    it('should throw error for non-array values', () => {
      const plain = { testArray: 'not-array' };

      expect(() => plainToInstance(ArrayTestEntity, plain)).toThrow('Expected array but received: string');
    });
  });

  describe('NumberTransform', () => {
    it('should convert string numbers to numbers', () => {
      const plain = { testNumber: '42' };
      const instance = plainToInstance(NumberTestEntity, plain);

      expect(instance.testNumber).toBe(42);
    });

    it('should preserve existing numbers', () => {
      const plain = { testNumber: 42 };
      const instance = plainToInstance(NumberTestEntity, plain);

      expect(instance.testNumber).toBe(42);
    });

    it('should handle null and undefined values', () => {
      const plainNull = { testNumber: null };
      const plainUndefined = { testNumber: undefined };

      const instanceNull = plainToInstance(NumberTestEntity, plainNull);
      const instanceUndefined = plainToInstance(NumberTestEntity, plainUndefined);

      expect(instanceNull.testNumber).toBeNull();
      expect(instanceUndefined.testNumber).toBeNull();
    });

    it('should throw error for invalid numbers', () => {
      const plain = { testNumber: 'not-a-number' };

      expect(() => plainToInstance(NumberTestEntity, plain)).toThrow('Cannot convert string to number: not-a-number');
    });

    it('should throw error for NaN and Infinity', () => {
      const plainNaN = { testNumber: NaN };
      const plainInfinity = { testNumber: Infinity };

      expect(() => plainToInstance(NumberTestEntity, plainNaN)).toThrow('Invalid number value: NaN');
      expect(() => plainToInstance(NumberTestEntity, plainInfinity)).toThrow('Invalid number value: Infinity');
    });
  });

  describe('BooleanTransform', () => {
    it('should preserve boolean values', () => {
      const plainTrue = { testBoolean: true };
      const plainFalse = { testBoolean: false };

      const instanceTrue = plainToInstance(BooleanTestEntity, plainTrue);
      const instanceFalse = plainToInstance(BooleanTestEntity, plainFalse);

      expect(instanceTrue.testBoolean).toBe(true);
      expect(instanceFalse.testBoolean).toBe(false);
    });

    it('should handle null and undefined values', () => {
      const plainNull = { testBoolean: null };
      const plainUndefined = { testBoolean: undefined };

      const instanceNull = plainToInstance(BooleanTestEntity, plainNull);
      const instanceUndefined = plainToInstance(BooleanTestEntity, plainUndefined);

      expect(instanceNull.testBoolean).toBeNull();
      expect(instanceUndefined.testBoolean).toBeNull();
    });

    it('should convert explicit string representations', () => {
      const plainTrue = { testBoolean: 'true' };
      const plainFalse = { testBoolean: 'false' };

      const instanceTrue = plainToInstance(BooleanTestEntity, plainTrue);
      const instanceFalse = plainToInstance(BooleanTestEntity, plainFalse);

      expect(instanceTrue.testBoolean).toBe(true);
      expect(instanceFalse.testBoolean).toBe(false);
    });

    it('should convert explicit numeric representations', () => {
      const plainOne = { testBoolean: 1 };
      const plainZero = { testBoolean: 0 };

      const instanceOne = plainToInstance(BooleanTestEntity, plainOne);
      const instanceZero = plainToInstance(BooleanTestEntity, plainZero);

      expect(instanceOne.testBoolean).toBe(true);
      expect(instanceZero.testBoolean).toBe(false);
    });

    it('should throw error for ambiguous values', () => {
      const plainAmbiguous = { testBoolean: 'maybe' };
      const plainNumber = { testBoolean: 2 };

      expect(() => plainToInstance(BooleanTestEntity, plainAmbiguous)).toThrow('Cannot convert string to boolean: maybe');
      expect(() => plainToInstance(BooleanTestEntity, plainNumber)).toThrow('Cannot convert number to boolean: 2');
    });
  });
});

describe('LLMTransformers', () => {
  describe('TemperatureTransform', () => {
    it('should preserve valid temperature values', () => {
      const validTemps = [
        { input: 0.7, expected: 0.7 },
        { input: 0, expected: 0 },
        { input: 2, expected: 2 },
        { input: 1.5, expected: 1.5 },
      ];

      validTemps.forEach(({ input, expected }) => {
        const plain = { temperature: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.temperature).toBe(expected);
      });
    });

    it('should clamp values above 2 to 2', () => {
      const testCases = [
        { input: 5.0, expected: 2 },
        { input: 3.7, expected: 2 },
        { input: 100, expected: 2 },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { temperature: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.temperature).toBe(expected);
      });
    });

    it('should clamp values below 0 to 0', () => {
      const testCases = [
        { input: -1.0, expected: 0 },
        { input: -0.5, expected: 0 },
        { input: -100, expected: 0 },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { temperature: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.temperature).toBe(expected);
      });
    });

    it('should parse string numbers', () => {
      const plain = { temperature: '0.8' };
      const instance = plainToInstance(LLMTestEntity, plain);

      expect(instance.temperature).toBe(0.8);
    });

    it('should return undefined for null and invalid values', () => {
      const testCases = [
        { input: null, expected: undefined },
        { input: undefined, expected: undefined },
        { input: 'not-a-number', expected: undefined },
        { input: 'invalid', expected: undefined },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { temperature: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.temperature).toBe(expected);
      });
    });
  });

  describe('MaxTokensTransform', () => {
    it('should preserve valid token counts', () => {
      const validTokens = [
        { input: 1000, expected: 1000 },
        { input: 1, expected: 1 },
        { input: 50000, expected: 50000 },
        { input: 100000, expected: 100000 },
      ];

      validTokens.forEach(({ input, expected }) => {
        const plain = { maxTokens: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.maxTokens).toBe(expected);
      });
    });

    it('should clamp values above 100000 to 100000', () => {
      const testCases = [
        { input: 200000, expected: 100000 },
        { input: 150000, expected: 100000 },
        { input: 500000, expected: 100000 },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { maxTokens: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.maxTokens).toBe(expected);
      });
    });

    it('should return undefined for values below 1', () => {
      const testCases = [
        { input: 0, expected: undefined },
        { input: -1, expected: undefined },
        { input: -100, expected: undefined },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { maxTokens: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.maxTokens).toBe(expected);
      });
    });

    it('should parse string numbers', () => {
      const plain = { maxTokens: '2000' };
      const instance = plainToInstance(LLMTestEntity, plain);

      expect(instance.maxTokens).toBe(2000);
    });

    it('should return undefined for null and invalid values', () => {
      const testCases = [
        { input: null, expected: undefined },
        { input: undefined, expected: undefined },
        { input: 'not-a-number', expected: undefined },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { maxTokens: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.maxTokens).toBe(expected);
      });
    });
  });

  describe('TimeoutTransform', () => {
    it('should preserve valid timeout values', () => {
      const validTimeouts = [
        { input: 30000, expected: 30000 },
        { input: 1000, expected: 1000 },
        { input: 60000, expected: 60000 },
        { input: 300000, expected: 300000 },
      ];

      validTimeouts.forEach(({ input, expected }) => {
        const plain = { timeout: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.timeout).toBe(expected);
      });
    });

    it('should clamp values above 300000 to 300000', () => {
      const testCases = [
        { input: 500000, expected: 300000 },
        { input: 400000, expected: 300000 },
        { input: 1000000, expected: 300000 },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { timeout: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.timeout).toBe(expected);
      });
    });

    it('should return default 30000 for values below 1000', () => {
      const testCases = [
        { input: 500, expected: 30000 },
        { input: 0, expected: 30000 },
        { input: -100, expected: 30000 },
        { input: 999, expected: 30000 },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { timeout: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.timeout).toBe(expected);
      });
    });

    it('should return default 30000 for null and invalid values', () => {
      const testCases = [
        { input: null, expected: 30000 },
        { input: undefined, expected: 30000 },
        { input: 'not-a-number', expected: 30000 },
      ];

      testCases.forEach(({ input, expected }) => {
        const plain = { timeout: input };
        const instance = plainToInstance(LLMTestEntity, plain);
        expect(instance.timeout).toBe(expected);
      });
    });

    it('should parse string numbers', () => {
      const plain = { timeout: '45000' };
      const instance = plainToInstance(LLMTestEntity, plain);

      expect(instance.timeout).toBe(45000);
    });
  });
});

describe('Real-world integration scenarios', () => {
  class ComplexTestEntity {
    @LLMTransformers.TemperatureTransform()
    temperature?: number;

    @LLMTransformers.MaxTokensTransform()
    maxTokens?: number;

    @LLMTransformers.TimeoutTransform()
    timeout?: number;

    @Transformers.JsonTransform()
    metadata?: Record<string, unknown>;

    @Transformers.DateTransform()
    createdAt?: string;
  }

  it('should work together in a real entity scenario', () => {
    const rawData = {
      temperature: '0.8',
      maxTokens: '2000',
      timeout: '45000',
      metadata: '{"model": "gpt-4", "version": "1.0"}',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    // Test deserialization
    const instance = plainToInstance(ComplexTestEntity, rawData);

    expect(instance.temperature).toBe(0.8);
    expect(instance.maxTokens).toBe(2000);
    expect(instance.timeout).toBe(45000);
    expect(instance.metadata).toEqual({ model: 'gpt-4', version: '1.0' });
    expect(instance.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(typeof instance.createdAt).toBe('string');

    // Test serialization
    const serialized = instanceToPlain(instance);

    expect(typeof serialized.metadata).toBe('string');
    expect(serialized.metadata).toBe('{"model":"gpt-4","version":"1.0"}');
    expect(serialized.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should handle validation-friendly transformations', () => {
    const testCases = [
      {
        input: { temperature: '0.5', maxTokens: '1000', timeout: '60000' },
        expected: { temperature: 0.5, maxTokens: 1000, timeout: 60000 },
      },
      {
        input: { temperature: '3.0', maxTokens: '200000', timeout: '500000' },
        expected: { temperature: 2.0, maxTokens: 100000, timeout: 300000 }, // Clamped values
      },
      {
        input: { temperature: '-1', maxTokens: '0', timeout: '500' },
        expected: { temperature: 0, maxTokens: undefined, timeout: 30000 }, // Corrected values
      },
    ];

    testCases.forEach(({ input, expected }) => {
      const instance = plainToInstance(ComplexTestEntity, input);

      expect(instance.temperature).toBe(expected.temperature);
      expect(instance.maxTokens).toBe(expected.maxTokens);
      expect(instance.timeout).toBe(expected.timeout);
    });
  });
});
