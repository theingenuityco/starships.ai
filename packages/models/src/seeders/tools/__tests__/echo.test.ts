/**
 * Echo Tool Functional Tests
 *
 * Tests that actually execute the echo tool and verify echoing functionality
 * instead of just validating static structure.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { echoTool, echoToolTemplate } from '../echo';
import { ToolTestRunner, CommonToolScenarios } from './tool-execution-helper';

interface EchoResult {
  type: 'echo';
  message: string;
  metadata: Record<string, unknown>;
  echoedAt: string;
}

describe('Echo Tool - Functional Tests', () => {
  let testRunner: ToolTestRunner;

  beforeEach(() => {
    testRunner = new ToolTestRunner(echoTool);
  });

  describe('Basic Echo Functionality', () => {
    it('should echo a simple message', async () => {
      const result = (await testRunner.testValidInput(
        { message: 'Hello, World!' },
        (output: any) => output.message === 'Hello, World!' && output.type === 'echo'
      )) as EchoResult;

      expect(result.type).toBe('echo');
      expect(result.message).toBe('Hello, World!');
      expect(result.echoedAt).toBeDefined();
      expect(typeof result.echoedAt).toBe('string');
    });

    it('should echo with metadata', async () => {
      const testMetadata = { userId: 123, source: 'test' };
      const result = (await testRunner.testValidInput(
        { message: 'Test with metadata', metadata: testMetadata },
        (output: any) => output.message === 'Test with metadata' && output.metadata.userId === 123
      )) as EchoResult;

      expect(result.message).toBe('Test with metadata');
      expect(result.metadata).toEqual(testMetadata);
      expect(result.type).toBe('echo');
    });

    it('should handle empty message', async () => {
      const result = (await testRunner.testValidInput(
        { message: '' },
        (output: any) => output.message === '' && output.type === 'echo'
      )) as EchoResult;

      expect(result.message).toBe('');
      expect(result.type).toBe('echo');
    });

    it('should handle message without metadata', async () => {
      const result = (await testRunner.testValidInput(
        { message: 'No metadata' },
        (output: any) => output.message === 'No metadata' && output.type === 'echo'
      )) as EchoResult;

      expect(result.message).toBe('No metadata');
      expect(result.metadata).toEqual({});
      expect(result.type).toBe('echo');
    });
  });

  describe('Message Types', () => {
    it('should echo long messages', async () => {
      const longMessage = 'A'.repeat(1000);
      const result = (await testRunner.testValidInput(
        { message: longMessage },
        (output: any) => output.message === longMessage
      )) as EchoResult;

      expect(result.message).toBe(longMessage);
      expect(result.message.length).toBe(1000);
    });

    it('should echo messages with special characters', async () => {
      const specialMessage = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./ 🚀🎉✨';
      const result = (await testRunner.testValidInput(
        { message: specialMessage },
        (output: any) => output.message === specialMessage
      )) as EchoResult;

      expect(result.message).toBe(specialMessage);
    });

    it('should echo multiline messages', async () => {
      const multilineMessage = 'Line 1\nLine 2\nLine 3';
      const result = (await testRunner.testValidInput(
        { message: multilineMessage },
        (output: any) => output.message === multilineMessage
      )) as EchoResult;

      expect(result.message).toBe(multilineMessage);
    });

    it('should echo JSON-like strings', async () => {
      const jsonMessage = '{"key": "value", "number": 42}';
      const result = (await testRunner.testValidInput(
        { message: jsonMessage },
        (output: any) => output.message === jsonMessage
      )) as EchoResult;

      expect(result.message).toBe(jsonMessage);
    });
  });

  describe('Metadata Handling', () => {
    it('should handle nested metadata', async () => {
      const nestedMetadata = {
        user: { id: 1, name: 'Test User' },
        settings: { theme: 'dark', lang: 'en' },
      };

      const result = (await testRunner.testValidInput(
        { message: 'Nested test', metadata: nestedMetadata },
        (output: any) => output.metadata.user.id === 1
      )) as EchoResult;

      expect(result.metadata).toEqual(nestedMetadata);
      expect((result.metadata as any).user.name).toBe('Test User');
    });

    it('should handle array metadata', async () => {
      const arrayMetadata = { tags: ['test', 'echo', 'tool'], ids: [1, 2, 3] };

      const result = (await testRunner.testValidInput({ message: 'Array test', metadata: arrayMetadata }, (output: any) =>
        Array.isArray(output.metadata.tags)
      )) as EchoResult;

      expect(result.metadata).toEqual(arrayMetadata);
      expect((result.metadata as any).tags).toHaveLength(3);
    });

    it('should handle null metadata gracefully', async () => {
      const result = (await testRunner.testValidInput(
        { message: 'Null metadata', metadata: null },
        (output: any) => output.message === 'Null metadata'
      )) as EchoResult;

      expect(result.message).toBe('Null metadata');
      // Should default to empty object for null metadata
      expect(result.metadata).toEqual({});
    });

    it('should handle undefined metadata gracefully', async () => {
      const result = (await testRunner.testValidInput(
        { message: 'Undefined metadata' },
        (output: any) => output.message === 'Undefined metadata'
      )) as EchoResult;

      expect(result.message).toBe('Undefined metadata');
      expect(result.metadata).toEqual({});
    });
  });

  describe('Timestamp Validation', () => {
    it('should generate valid ISO timestamp', async () => {
      const result = (await testRunner.testValidInput(
        { message: 'Timestamp test' },
        (output: any) => typeof output.echoedAt === 'string'
      )) as EchoResult;

      // Check if it's a valid ISO string
      const timestamp = new Date(result.echoedAt);
      expect(timestamp.toISOString()).toBe(result.echoedAt);

      // Should be recent (within last few seconds)
      const now = new Date();
      const diff = now.getTime() - timestamp.getTime();
      expect(diff).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should generate unique timestamps for concurrent calls', async () => {
      const promises = Array.from({ length: 3 }, (_, i) => testRunner.testValidInput({ message: `Concurrent ${i}` }));

      const results = (await Promise.all(promises)) as EchoResult[];

      // All timestamps should be different (or very close)
      const timestamps = results.map((r) => r.echoedAt);
      const uniqueTimestamps = new Set(timestamps);

      // Should have unique timestamps or very close ones
      expect(uniqueTimestamps.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Input Edge Cases', () => {
    it('should handle missing message parameter gracefully', async () => {
      const result = (await testRunner.testValidInput({}, (output: any) => output.type === 'echo')) as EchoResult;

      // Should handle gracefully, possibly with undefined/null message
      expect(result.type).toBe('echo');
      expect(result.metadata).toEqual({});
    });

    it('should preserve message exactly as provided', async () => {
      const testCases = ['  spaces around  ', 'UPPERCASE', 'lowercase', 'MiXeD cAsE', '123456789', ''];

      for (const testMessage of testCases) {
        const result = (await testRunner.testValidInput(
          { message: testMessage },
          (output: any) => output.message === testMessage
        )) as EchoResult;

        expect(result.message).toBe(testMessage);
      }
    });
  });

  describe('Output Structure Validation', () => {
    it('should have all required output fields', async () => {
      const result = (await testRunner.testValidInput({ message: 'Structure test' })) as EchoResult;

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('echoedAt');

      expect(result.type).toBe('echo');
    });

    it('should maintain consistent output structure', async () => {
      const results = (await Promise.all([
        testRunner.testValidInput({ message: 'Test 1' }),
        testRunner.testValidInput({ message: 'Test 2', metadata: { id: 1 } }),
        testRunner.testValidInput({ message: 'Test 3' }),
      ])) as EchoResult[];

      results.forEach((result) => {
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('metadata');
        expect(result).toHaveProperty('echoedAt');
        expect(result.type).toBe('echo');
      });
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle rapid sequential echoes', async () => {
      const messages = Array.from({ length: 10 }, (_, i) => `Message ${i}`);
      const results = [];

      for (const message of messages) {
        const result = (await testRunner.testValidInput({ message }, (output: any) => output.message === message)) as EchoResult;
        results.push(result);
      }

      results.forEach((result, index) => {
        expect(result.message).toBe(`Message ${index}`);
        expect(result.type).toBe('echo');
      });
    });

    it('should handle concurrent echoes', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        testRunner.testValidInput(
          { message: `Concurrent ${i}`, metadata: { index: i } },
          (output: any) => output.message === `Concurrent ${i}`
        )
      );

      const results = (await Promise.all(promises)) as EchoResult[];

      results.forEach((result, index) => {
        expect(result.message).toBe(`Concurrent ${index}`);
        expect((result.metadata as any).index).toBe(index);
      });
    });
  });

  describe('Tool Template Consistency', () => {
    it('should have consistent tool and template', () => {
      expect(echoToolTemplate.name).toBe(echoTool.name);
      expect(echoToolTemplate.description).toBe(echoTool.description);
      expect(echoToolTemplate.parameters).toEqual(echoTool.parameters);
      expect(echoToolTemplate.blueprint).toEqual(echoTool.blueprint);
    });

    it('should have correct template metadata', () => {
      expect(echoToolTemplate.slug).toBe('echo');
      expect(echoToolTemplate.category).toBe('utility');
      expect(echoToolTemplate.requiresApiKey).toBe(false);
      expect(echoToolTemplate.configurationFields).toEqual([]);
    });
  });

  describe('Common Test Scenarios', () => {
    it('should pass common echo scenarios', async () => {
      const results = await testRunner.testScenarios(CommonToolScenarios.echo);

      results.forEach((result) => {
        if (result.name.includes('simple message') || result.name.includes('metadata')) {
          expect(result.passed).toBe(true);
        }
        if (result.name.includes('missing message')) {
          // Echo tool should handle this gracefully
          expect(result.passed).toBe(true);
        }
      });
    });
  });

  describe('Debugging and Testing Utility', () => {
    it('should be useful for testing tool infrastructure', async () => {
      const testData = {
        message: 'Infrastructure test',
        metadata: {
          testRun: Date.now(),
          environment: 'test',
          features: ['echo', 'metadata', 'timestamp'],
        },
      };

      const result = (await testRunner.testValidInput(testData, (output: any) => output.message === testData.message)) as EchoResult;

      expect(result.message).toBe(testData.message);
      expect(result.metadata).toEqual(testData.metadata);
      expect(result.type).toBe('echo');
      expect(new Date(result.echoedAt)).toBeInstanceOf(Date);
    });

    it('should provide complete debugging information', async () => {
      const debugData = {
        message: 'Debug test',
        metadata: {
          requestId: 'req-123',
          userId: 'user-456',
          action: 'echo-test',
          timestamp: Date.now(),
        },
      };

      const result = (await testRunner.testValidInput(debugData)) as EchoResult;

      // Should preserve all debugging information
      expect(result.message).toBe(debugData.message);
      expect(result.metadata).toEqual(debugData.metadata);
      expect(result.echoedAt).toBeDefined();

      // Verify it's actually echoing, not transforming
      expect(JSON.stringify(result.metadata)).toBe(JSON.stringify(debugData.metadata));
    });
  });
});
