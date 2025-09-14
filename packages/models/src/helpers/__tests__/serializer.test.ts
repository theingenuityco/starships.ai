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
  createdAt?: Date | string;

  @Expose()
  @Transformers.DateTransform()
  updatedAt?: Date | string;
}

class ArrayTestEntity {
  @Expose()
  @Transformers.ArrayTransform()
  defaultArray?: unknown[];

  @Expose()
  @Transformers.ArrayTransform(['default'])
  customDefaultArray?: unknown[];
}

class NumberTestEntity {
  @Expose()
  @Transformers.NumberTransform()
  defaultNumber?: number;

  @Expose()
  @Transformers.NumberTransform(100)
  customDefaultNumber?: number;
}

class BooleanTestEntity {
  @Expose()
  @Transformers.BooleanTransform()
  defaultBoolean?: boolean;

  @Expose()
  @Transformers.BooleanTransform(true)
  customDefaultBoolean?: boolean;
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
    it('should convert date strings to Date objects during deserialization', () => {
      const dateString = '2024-01-01T00:00:00.000Z';
      const plain = {
        createdAt: dateString,
        updatedAt: '2024-01-02T12:30:45.123Z',
      };

      const instance = plainToInstance(DateTestEntity, plain);

      expect(instance.createdAt).toBeInstanceOf(Date);
      expect((instance.createdAt as Date).toISOString()).toBe(dateString);
      expect(instance.updatedAt).toBeInstanceOf(Date);
    });

    it('should convert Date objects to ISO strings during serialization', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const instance = new DateTestEntity();
      instance.createdAt = date;
      instance.updatedAt = new Date('2024-01-02T12:30:45.123Z');

      const plain = instanceToPlain(instance);

      expect(plain.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(plain.updatedAt).toBe('2024-01-02T12:30:45.123Z');
    });

    it('should handle null and undefined values', () => {
      const plain = { createdAt: null, updatedAt: undefined };
      const instance = plainToInstance(DateTestEntity, plain);

      expect(instance.createdAt).toBeNull();
      expect(instance.updatedAt).toBeNull(); // Transform converts undefined to null
    });

    it('should handle timestamp numbers', () => {
      const timestamp = 1704067200000; // 2024-01-01T00:00:00.000Z
      const plain = { createdAt: timestamp };

      const instance = plainToInstance(DateTestEntity, plain);

      expect(instance.createdAt).toBeInstanceOf(Date);
      expect((instance.createdAt as Date).toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('ArrayTransform', () => {
    it('should preserve arrays', () => {
      const array = [1, 2, 3];
      const plain = { defaultArray: array, customDefaultArray: ['a', 'b'] };

      const instance = plainToInstance(ArrayTestEntity, plain);

      expect(instance.defaultArray).toEqual(array);
      expect(instance.customDefaultArray).toEqual(['a', 'b']);
    });

    it('should return default array for null values', () => {
      const plain = { defaultArray: null, customDefaultArray: null };

      const instance = plainToInstance(ArrayTestEntity, plain);

      expect(instance.defaultArray).toEqual([]);
      expect(instance.customDefaultArray).toEqual(['default']);
    });

    it('should return default array for undefined values', () => {
      const plain = { defaultArray: undefined, customDefaultArray: undefined };

      const instance = plainToInstance(ArrayTestEntity, plain);

      expect(instance.defaultArray).toEqual([]);
      expect(instance.customDefaultArray).toEqual(['default']);
    });

    it('should return default for non-array values', () => {
      const plain = {
        defaultArray: 'not-array',
        customDefaultArray: 'also-not-array',
      };

      const instance = plainToInstance(ArrayTestEntity, plain);

      expect(instance.defaultArray).toEqual([]);
      expect(instance.customDefaultArray).toEqual(['default']);
    });
  });

  describe('NumberTransform', () => {
    it('should convert string numbers to numbers', () => {
      const plain = {
        defaultNumber: '42',
        customDefaultNumber: '123.5',
      };

      const instance = plainToInstance(NumberTestEntity, plain);

      expect(instance.defaultNumber).toBe(42);
      expect(instance.customDefaultNumber).toBe(123.5);
    });

    it('should preserve existing numbers', () => {
      const plain = {
        defaultNumber: 42,
        customDefaultNumber: -17.5,
      };

      const instance = plainToInstance(NumberTestEntity, plain);

      expect(instance.defaultNumber).toBe(42);
      expect(instance.customDefaultNumber).toBe(-17.5);
    });

    it('should return default for invalid numbers', () => {
      const plain = {
        defaultNumber: 'not-a-number',
        customDefaultNumber: 'also-invalid',
      };

      const instance = plainToInstance(NumberTestEntity, plain);

      expect(instance.defaultNumber).toBe(0);
      expect(instance.customDefaultNumber).toBe(100);
    });
  });

  describe('BooleanTransform', () => {
    it('should preserve boolean values', () => {
      const plain = {
        defaultBoolean: true,
        customDefaultBoolean: false,
      };

      const instance = plainToInstance(BooleanTestEntity, plain);

      expect(instance.defaultBoolean).toBe(true);
      expect(instance.customDefaultBoolean).toBe(false);
    });

    it('should return default for null values', () => {
      const plain = {
        defaultBoolean: null,
        customDefaultBoolean: null,
      };

      const instance = plainToInstance(BooleanTestEntity, plain);

      expect(instance.defaultBoolean).toBe(false);
      expect(instance.customDefaultBoolean).toBe(true);
    });

    it('should convert truthy values to true', () => {
      const plain = {
        defaultBoolean: 'true',
        customDefaultBoolean: 1,
      };

      const instance = plainToInstance(BooleanTestEntity, plain);

      expect(instance.defaultBoolean).toBe(true);
      expect(instance.customDefaultBoolean).toBe(true);
    });

    it('should convert falsy values to false', () => {
      const plain = {
        defaultBoolean: '',
        customDefaultBoolean: 0,
      };

      const instance = plainToInstance(BooleanTestEntity, plain);

      expect(instance.defaultBoolean).toBe(false);
      expect(instance.customDefaultBoolean).toBe(false);
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
    createdAt?: Date | string;
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
    expect(instance.createdAt).toBeInstanceOf(Date);

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
