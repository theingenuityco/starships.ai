/**
 * Echo Tool Tests
 * End-to-end tests for the echo tool using autopilot Tool node
 */

import { echoTool, echoToolTemplate } from '../echo';
import { ToolTestHelper, CommonToolTestData } from './tool-test-helper';

describe('Echo Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(echoTool, echoToolTemplate, 'echo');
    testHelper.clearEventLogs();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      const result = testHelper.testToolStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct tool name', () => {
      expect(echoTool.name).toBe('echo');
    });

    it('should have descriptive description', () => {
      expect(echoTool.description).toContain('Echo back');
      expect(echoTool.description.length).toBeGreaterThan(10);
    });
  });

  describe('Parameter Schema', () => {
    it('should have valid parameter schema', () => {
      const result = testHelper.testParameterSchema();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require message parameter', () => {
      expect(echoTool.parameters.required).toContain('message');
    });

    it('should define message as string type', () => {
      const messageProp = echoTool.parameters.properties?.message as { type: string; description: string };
      expect(messageProp?.type).toBe('string');
      expect(messageProp?.description).toBeDefined();
    });

    it('should have optional metadata parameter', () => {
      const metadataProp = echoTool.parameters.properties?.metadata as { type: string; description: string };
      expect(metadataProp?.type).toBe('object');
      expect(metadataProp?.description).toBeDefined();
      expect(echoTool.parameters.required).not.toContain('metadata');
    });
  });

  describe('Blueprint Structure', () => {
    it('should have valid blueprint structure', () => {
      const result = testHelper.testBlueprintStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have start and end nodes', () => {
      const blueprint = echoTool.blueprint;
      const hasStart = blueprint.nodes.some((n) => n.type === 'start');
      const hasEnd = blueprint.nodes.some((n) => n.type === 'end');

      expect(hasStart).toBe(true);
      expect(hasEnd).toBe(true);
    });

    it('should have minimal structure (start->end)', () => {
      const blueprint = echoTool.blueprint;
      expect(blueprint.nodes).toHaveLength(2); // start and end only
      expect(blueprint.edges).toHaveLength(1); // single edge
    });

    it('should use end node output for echoing', () => {
      const blueprint = echoTool.blueprint;
      const endNode = blueprint.nodes.find((n) => n.type === 'end');
      expect(endNode?.parameters).toBeDefined();
      if (endNode?.parameters) {
        const params = endNode.parameters as Record<string, unknown>;
        expect(params.output).toBeDefined();
      }
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      const result = testHelper.testTemplateConsistency();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct template metadata', () => {
      expect(echoToolTemplate.slug).toBe('echo');
      expect(echoToolTemplate.category).toBe('utility');
      expect(echoToolTemplate.requiresApiKey).toBe(false);
    });

    it('should have example usage', () => {
      expect(echoToolTemplate.exampleUsage).toBeDefined();
      if (echoToolTemplate.exampleUsage) {
        expect(echoToolTemplate.exampleUsage.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Tool Execution', () => {
    it('should echo back simple message', async () => {
      const input = { message: 'Hello, World!' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { type: string; message: string; echoedAt: string };
        expect(echoResult.type).toBe('echo');
        expect(echoResult.message).toBe('Hello, World!');
        expect(echoResult.echoedAt).toBeDefined();
      }
    });

    it('should echo back with metadata', async () => {
      const input = CommonToolTestData.VALID_ECHO_INPUT;
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as {
          type: string;
          message: string;
          metadata: Record<string, unknown>;
          echoedAt: string;
        };
        expect(echoResult.type).toBe('echo');
        expect(echoResult.message).toBe('Hello, tools!');
        expect(echoResult.metadata).toEqual({ test: true });
        expect(echoResult.echoedAt).toBeDefined();
      }
    });

    it('should handle empty metadata', async () => {
      const input = { message: 'Test message' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { metadata: Record<string, unknown> };
        expect(echoResult.metadata).toEqual({});
      }
    });

    it('should include timestamp in output', async () => {
      const beforeTime = new Date().toISOString();
      const input = { message: 'Timestamp test' };
      const result = await testHelper.executeToolViaEngine(input);
      const afterTime = new Date().toISOString();

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { echoedAt: string };
        expect(echoResult.echoedAt).toBeDefined();
        expect(echoResult.echoedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format
        expect(echoResult.echoedAt >= beforeTime).toBe(true);
        expect(echoResult.echoedAt <= afterTime).toBe(true);
      }
    });

    it('should handle special characters in message', async () => {
      const input = { message: 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { message: string };
        expect(echoResult.message).toBe('Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?');
      }
    });

    it('should handle unicode characters', async () => {
      const input = { message: '🚀 Hello 世界 🌟' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { message: string };
        expect(echoResult.message).toBe('🚀 Hello 世界 🌟');
      }
    });

    it('should emit proper events during execution', async () => {
      const input = { message: 'Event test' };
      await testHelper.executeToolViaEngine(input);

      const events = testHelper.getEventLogs();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should complete within reasonable time', async () => {
      const input = { message: 'Performance test' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('Error Handling', () => {
    it('should handle missing message parameter', async () => {
      const input = {}; // Missing required message
      const result = await testHelper.executeToolViaEngine(input);

      // The tool should still work but might have undefined message
      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { message: string };
        // The template uses $lastOutputOf("__initial__")[0].json.message which would be undefined
        expect(echoResult.message).toBeUndefined();
      }
    });

    it('should handle non-string message', async () => {
      const input = { message: 12345 };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      // The echo tool is flexible and will echo whatever is provided
      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { message: number };
        expect(echoResult.message).toBe(12345);
      }
    });

    it('should handle complex metadata objects', async () => {
      const complexMetadata = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
          null: null,
          boolean: true,
        },
      };

      const input = { message: 'Complex test', metadata: complexMetadata };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { metadata: typeof complexMetadata };
        expect(echoResult.metadata).toEqual(complexMetadata);
      }
    });

    it('should handle very long messages', async () => {
      const longMessage = 'A'.repeat(10000);
      const input = { message: longMessage };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const echoResult = result.result as { message: string };
        expect(echoResult.message).toBe(longMessage);
      }
    });
  });

  describe('All Validation Tests', () => {
    it('should pass comprehensive validation', () => {
      const validation = testHelper.runAllValidationTests();

      expect(validation.structureValid).toBe(true);
      expect(validation.parametersValid).toBe(true);
      expect(validation.blueprintValid).toBe(true);
      expect(validation.templateValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
