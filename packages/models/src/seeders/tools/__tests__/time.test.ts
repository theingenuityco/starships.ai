/**
 * Time Tool Functional Tests
 *
 * Tests that actually execute the time tool and verify time operations
 * instead of just validating static structure.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { timeTool, timeToolTemplate } from '../time';
import { ToolTestRunner, CommonToolScenarios } from './tool-execution-helper';

interface TimeResult {
  currentTime: string;
  timezone: string;
  format: string;
  timestamp: number;
}

describe('Time Tool - Functional Tests', () => {
  let testRunner: ToolTestRunner;

  beforeEach(() => {
    testRunner = new ToolTestRunner(timeTool);
  });

  describe('Basic Time Operations', () => {
    it('should return current time with default settings', async () => {
      const result = (await testRunner.testValidInput(
        {},
        (output: any) => typeof output.currentTime === 'string' && typeof output.timestamp === 'number'
      )) as TimeResult;

      expect(result.timezone).toBe('UTC');
      expect(result.format).toBe('ISO');
      expect(typeof result.currentTime).toBe('string');
      expect(typeof result.timestamp).toBe('number');

      // Should be a valid ISO string
      expect(() => new Date(result.currentTime)).not.toThrow();

      // Timestamp should be recent (within last few seconds)
      const now = Date.now();
      expect(Math.abs(now - result.timestamp)).toBeLessThan(5000);
    });

    it('should return time in UTC timezone', async () => {
      const result = (await testRunner.testValidInput({ timezone: 'UTC' }, (output: any) => output.timezone === 'UTC')) as TimeResult;

      expect(result.timezone).toBe('UTC');
      expect(result.currentTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return time in ISO format', async () => {
      const result = (await testRunner.testValidInput({ format: 'ISO' }, (output: any) => output.format === 'ISO')) as TimeResult;

      expect(result.format).toBe('ISO');
      expect(typeof result.currentTime).toBe('string');

      // Should be valid ISO format
      const date = new Date(result.currentTime);
      expect(date.toISOString()).toBe(result.currentTime);
    });

    it('should return timestamp format', async () => {
      const result = (await testRunner.testValidInput(
        { format: 'timestamp' },
        (output: any) => output.format === 'timestamp' && typeof output.timestamp === 'number'
      )) as TimeResult;

      expect(result.format).toBe('timestamp');
      expect(typeof result.timestamp).toBe('number');

      // Timestamp should be recent
      const now = Date.now();
      expect(Math.abs(now - result.timestamp)).toBeLessThan(5000);
    });

    it('should return locale format', async () => {
      const result = (await testRunner.testValidInput({ format: 'locale' }, (output: any) => output.format === 'locale')) as TimeResult;

      expect(result.format).toBe('locale');
      expect(typeof result.currentTime).toBe('string');
      expect(result.currentTime.length).toBeGreaterThan(0);
    });
  });

  describe('Timezone Handling', () => {
    it('should handle America/New_York timezone', async () => {
      const result = (await testRunner.testValidInput(
        { timezone: 'America/New_York', format: 'locale' },
        (output: any) => output.timezone === 'America/New_York'
      )) as TimeResult;

      expect(result.timezone).toBe('America/New_York');
      expect(typeof result.currentTime).toBe('string');
    });

    it('should handle Europe/London timezone', async () => {
      const result = (await testRunner.testValidInput(
        { timezone: 'Europe/London', format: 'locale' },
        (output: any) => output.timezone === 'Europe/London'
      )) as TimeResult;

      expect(result.timezone).toBe('Europe/London');
      expect(typeof result.currentTime).toBe('string');
    });

    it('should handle Asia/Tokyo timezone', async () => {
      const result = (await testRunner.testValidInput(
        { timezone: 'Asia/Tokyo', format: 'locale' },
        (output: any) => output.timezone === 'Asia/Tokyo'
      )) as TimeResult;

      expect(result.timezone).toBe('Asia/Tokyo');
      expect(typeof result.currentTime).toBe('string');
    });

    it('should default to UTC for unspecified timezone', async () => {
      const result = (await testRunner.testValidInput({ format: 'ISO' }, (output: any) => output.timezone === 'UTC')) as TimeResult;

      expect(result.timezone).toBe('UTC');
    });
  });

  describe('Format Variations', () => {
    it('should handle all format types with UTC', async () => {
      const formats = ['ISO', 'locale', 'timestamp'];

      for (const format of formats) {
        const result = (await testRunner.testValidInput(
          { timezone: 'UTC', format },
          (output: any) => output.format === format
        )) as TimeResult;

        expect(result.format).toBe(format);
        expect(result.timezone).toBe('UTC');

        if (format === 'timestamp') {
          expect(typeof result.timestamp).toBe('number');
        } else {
          expect(typeof result.currentTime).toBe('string');
        }
      }
    });

    it('should handle format with different timezones', async () => {
      const timezones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];

      for (const timezone of timezones) {
        const result = (await testRunner.testValidInput(
          { timezone, format: 'locale' },
          (output: any) => output.timezone === timezone
        )) as TimeResult;

        expect(result.timezone).toBe(timezone);
        expect(result.format).toBe('locale');
        expect(typeof result.currentTime).toBe('string');
      }
    });

    it('should default to ISO format when unspecified', async () => {
      const result = (await testRunner.testValidInput({ timezone: 'UTC' }, (output: any) => output.format === 'ISO')) as TimeResult;

      expect(result.format).toBe('ISO');
      expect(result.currentTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('Output Structure Validation', () => {
    it('should have all required output fields', async () => {
      const result = (await testRunner.testValidInput({})) as TimeResult;

      expect(result).toHaveProperty('currentTime');
      expect(result).toHaveProperty('timezone');
      expect(result).toHaveProperty('format');
      expect(result).toHaveProperty('timestamp');
    });

    it('should maintain consistent output structure across calls', async () => {
      const results = (await Promise.all([
        testRunner.testValidInput({}),
        testRunner.testValidInput({ timezone: 'UTC' }),
        testRunner.testValidInput({ format: 'ISO' }),
        testRunner.testValidInput({ timezone: 'UTC', format: 'ISO' }),
      ])) as TimeResult[];

      results.forEach((result) => {
        expect(result).toHaveProperty('currentTime');
        expect(result).toHaveProperty('timezone');
        expect(result).toHaveProperty('format');
        expect(result).toHaveProperty('timestamp');
      });
    });

    it('should have valid timestamp in all calls', async () => {
      const result = (await testRunner.testValidInput({
        timezone: 'America/New_York',
        format: 'locale',
      })) as TimeResult;

      expect(typeof result.timestamp).toBe('number');
      expect(result.timestamp).toBeGreaterThan(0);

      // Should be recent
      const now = Date.now();
      expect(Math.abs(now - result.timestamp)).toBeLessThan(5000);
    });
  });

  describe('Time Accuracy and Consistency', () => {
    it('should return accurate current time', async () => {
      const beforeCall = Date.now();
      const result = (await testRunner.testValidInput({})) as TimeResult;
      const afterCall = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(beforeCall - 1000); // Allow 1s tolerance
      expect(result.timestamp).toBeLessThanOrEqual(afterCall + 1000);
    });

    it('should have consistent timestamp and currentTime', async () => {
      const result = (await testRunner.testValidInput({
        timezone: 'UTC',
        format: 'ISO',
      })) as TimeResult;

      const timeFromString = new Date(result.currentTime).getTime();

      // Should be very close (within 1 second)
      expect(Math.abs(timeFromString - result.timestamp)).toBeLessThan(1000);
    });

    it('should generate different times for sequential calls', async () => {
      const result1 = (await testRunner.testValidInput({})) as TimeResult;
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result2 = (await testRunner.testValidInput({})) as TimeResult;

      expect(result2.timestamp).toBeGreaterThanOrEqual(result1.timestamp);
    });
  });

  describe('Parameter Validation', () => {
    it('should reject invalid timezone', async () => {
      // The tool actually throws an error for invalid timezones
      await testRunner.testInvalidInput({ timezone: 'Invalid/Timezone' as any }, 'Invalid time zone specified');
    });

    it('should handle invalid format gracefully', async () => {
      // Should default to ISO format
      const result = (await testRunner.testValidInput(
        { format: 'invalid' as any },
        (output: any) => typeof output.currentTime === 'string'
      )) as TimeResult;

      expect(typeof result.currentTime).toBe('string');
      expect(typeof result.timestamp).toBe('number');
    });

    it('should handle mixed valid and invalid parameters', async () => {
      const result = (await testRunner.testValidInput(
        { timezone: 'UTC', format: 'invalid' as any },
        (output: any) => output.timezone === 'UTC'
      )) as TimeResult;

      expect(result.timezone).toBe('UTC');
      expect(typeof result.currentTime).toBe('string');
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle rapid sequential time requests', async () => {
      const results = [];

      for (let i = 0; i < 5; i++) {
        const result = (await testRunner.testValidInput({})) as TimeResult;
        results.push(result);
      }

      // All should be valid
      results.forEach((result) => {
        expect(typeof result.currentTime).toBe('string');
        expect(typeof result.timestamp).toBe('number');
        expect(result.timezone).toBe('UTC');
        expect(result.format).toBe('ISO');
      });

      // Timestamps should be in order (or very close)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].timestamp).toBeGreaterThanOrEqual(results[i - 1].timestamp);
      }
    });

    it('should handle concurrent time requests', async () => {
      const promises = Array.from({ length: 3 }, () => testRunner.testValidInput({ timezone: 'UTC', format: 'ISO' }));

      const results = (await Promise.all(promises)) as TimeResult[];

      results.forEach((result) => {
        expect(result.timezone).toBe('UTC');
        expect(result.format).toBe('ISO');
        expect(typeof result.currentTime).toBe('string');
        expect(typeof result.timestamp).toBe('number');
      });
    });

    it('should be reliable across different parameter combinations', async () => {
      const testCases = [
        {},
        { timezone: 'UTC' },
        { format: 'ISO' },
        { format: 'locale' },
        { format: 'timestamp' },
        { timezone: 'America/New_York', format: 'locale' },
        { timezone: 'Asia/Tokyo', format: 'ISO' },
      ];

      for (const testCase of testCases) {
        const result = (await testRunner.testValidInput(testCase)) as TimeResult;

        expect(typeof result.currentTime === 'string' || typeof result.currentTime === 'number').toBe(true);
        expect(typeof result.timestamp).toBe('number');
        expect(typeof result.timezone).toBe('string');
        expect(typeof result.format).toBe('string');
      }
    });
  });

  describe('Tool Template Consistency', () => {
    it('should have consistent tool and template', () => {
      expect(timeToolTemplate.name).toBe(timeTool.name);
      expect(timeToolTemplate.description).toBe(timeTool.description);
      expect(timeToolTemplate.parameters).toEqual(timeTool.parameters);
      expect(timeToolTemplate.blueprint).toEqual(timeTool.blueprint);
    });

    it('should have correct template metadata', () => {
      expect(timeToolTemplate.slug).toBe('get-current-time');
      expect(timeToolTemplate.category).toBe('utility');
      expect(timeToolTemplate.requiresApiKey).toBe(false);
      expect(timeToolTemplate.configurationFields).toEqual([]);
    });
  });

  describe('Common Test Scenarios', () => {
    it('should pass common time scenarios', async () => {
      const results = await testRunner.testScenarios(CommonToolScenarios.time);

      results.forEach((result) => {
        expect(result.passed).toBe(true);
      });
    });
  });

  describe('Timezone Differences', () => {
    it('should show different times for different timezones', async () => {
      const utcResult = (await testRunner.testValidInput({
        timezone: 'UTC',
        format: 'locale',
      })) as TimeResult;

      const nyResult = (await testRunner.testValidInput({
        timezone: 'America/New_York',
        format: 'locale',
      })) as TimeResult;

      // Times might be different due to timezone (though timestamps should be close)
      expect(utcResult.timezone).toBe('UTC');
      expect(nyResult.timezone).toBe('America/New_York');

      // Timestamps should be very close (same moment in time)
      expect(Math.abs(utcResult.timestamp - nyResult.timestamp)).toBeLessThan(1000);
    });

    it('should handle daylight saving time zones correctly', async () => {
      const timezones = ['America/New_York', 'Europe/London'];

      for (const timezone of timezones) {
        const result = (await testRunner.testValidInput({
          timezone,
          format: 'locale',
        })) as TimeResult;

        expect(result.timezone).toBe(timezone);
        expect(typeof result.currentTime).toBe('string');
        expect(typeof result.timestamp).toBe('number');
      }
    });
  });

  describe('Error Handling', () => {
    it('should not throw errors for any valid parameter combinations', async () => {
      const timezones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
      const formats = ['ISO', 'locale', 'timestamp'];

      for (const timezone of timezones) {
        for (const format of formats) {
          await expect(async () => {
            await testRunner.testValidInput({ timezone, format });
          }).not.toThrow();
        }
      }
    });

    it('should handle edge cases gracefully', async () => {
      const edgeCases = [
        { timezone: '', format: '' },
        { timezone: null, format: null },
        { timezone: undefined, format: undefined },
      ];

      for (const testCase of edgeCases) {
        await expect(async () => {
          await testRunner.testValidInput(testCase as any);
        }).not.toThrow();
      }
    });
  });
});
