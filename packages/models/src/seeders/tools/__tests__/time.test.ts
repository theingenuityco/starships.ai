/**
 * Time Tool Tests
 * End-to-end tests for the get_current_time tool using autopilot Tool node
 */

import { timeTool, timeToolTemplate } from '../time';
import { ToolTestHelper, CommonToolTestData } from './tool-test-helper';

describe('Time Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(timeTool, timeToolTemplate, 'get_current_time');
    testHelper.clearEventLogs();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      const result = testHelper.testToolStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct tool name', () => {
      expect(timeTool.name).toBe('get_current_time');
    });

    it('should have descriptive description', () => {
      expect(timeTool.description).toContain('current date and time');
      expect(timeTool.description.length).toBeGreaterThan(10);
    });
  });

  describe('Parameter Schema', () => {
    it('should have valid parameter schema', () => {
      const result = testHelper.testParameterSchema();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have no required parameters', () => {
      expect(timeTool.parameters.required).toEqual([]);
    });

    it('should define timezone parameter with enum', () => {
      const timezoneProp = timeTool.parameters.properties?.timezone as {
        type: string;
        description: string;
        enum: string[];
      };
      expect(timezoneProp?.type).toBe('string');
      expect(timezoneProp?.description).toBeDefined();
      expect(timezoneProp?.enum).toContain('UTC');
      expect(timezoneProp?.enum).toContain('America/New_York');
    });

    it('should define format parameter with enum', () => {
      const formatProp = timeTool.parameters.properties?.format as {
        type: string;
        description: string;
        enum: string[];
      };
      expect(formatProp?.type).toBe('string');
      expect(formatProp?.description).toBeDefined();
      expect(formatProp?.enum).toContain('ISO');
      expect(formatProp?.enum).toContain('locale');
      expect(formatProp?.enum).toContain('timestamp');
    });
  });

  describe('Blueprint Structure', () => {
    it('should have valid blueprint structure', () => {
      const result = testHelper.testBlueprintStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have start and end nodes', () => {
      const blueprint = timeTool.blueprint;
      const hasStart = blueprint.nodes.some((n) => n.type === 'start');
      const hasEnd = blueprint.nodes.some((n) => n.type === 'end');

      expect(hasStart).toBe(true);
      expect(hasEnd).toBe(true);
    });

    it('should have time generation code node', () => {
      const blueprint = timeTool.blueprint;
      const hasTimeNode = blueprint.nodes.some((n) => n.type === 'code' && n.name?.toLowerCase().includes('time'));
      expect(hasTimeNode).toBe(true);
    });

    it('should have proper node connectivity', () => {
      const blueprint = timeTool.blueprint;
      const nodeRefs = new Set(blueprint.nodes.map((n) => n.ref));

      for (const edge of blueprint.edges) {
        expect(nodeRefs.has(edge.from)).toBe(true);
        expect(nodeRefs.has(edge.to)).toBe(true);
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
      expect(timeToolTemplate.slug).toBe('get-current-time');
      expect(timeToolTemplate.category).toBe('utility');
      expect(timeToolTemplate.requiresApiKey).toBe(false);
    });

    it('should have example usage', () => {
      expect(timeToolTemplate.exampleUsage).toBeDefined();
      if (timeToolTemplate.exampleUsage) {
        expect(timeToolTemplate.exampleUsage.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Tool Execution', () => {
    it('should get current time with default parameters', async () => {
      const input = {};
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      if (result.result && typeof result.result === 'object') {
        const timeResult = result.result as {
          currentTime: string;
          timezone: string;
          format: string;
          timestamp: number;
        };
        expect(timeResult.currentTime).toBeDefined();
        expect(timeResult.timezone).toBe('UTC'); // default
        expect(timeResult.format).toBe('ISO'); // default
        expect(timeResult.timestamp).toBeGreaterThan(0);
      }
    });

    it('should get current time with UTC timezone and ISO format', async () => {
      const input = CommonToolTestData.VALID_TIME_INPUT;
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const timeResult = result.result as {
          currentTime: string;
          timezone: string;
          format: string;
          timestamp: number;
        };
        expect(timeResult.timezone).toBe('UTC');
        expect(timeResult.format).toBe('ISO');
        expect(timeResult.currentTime).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format
        expect(timeResult.timestamp).toBeGreaterThan(Date.now() - 5000); // Within last 5 seconds
      }
    });

    it('should get current time with locale format', async () => {
      const input = { timezone: 'UTC', format: 'locale' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const timeResult = result.result as {
          currentTime: string;
          timezone: string;
          format: string;
        };
        expect(timeResult.timezone).toBe('UTC');
        expect(timeResult.format).toBe('locale');
        expect(timeResult.currentTime).toBeDefined();
        expect(typeof timeResult.currentTime).toBe('string');
      }
    });

    it('should get current time with timestamp format', async () => {
      const input = { timezone: 'UTC', format: 'timestamp' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const timeResult = result.result as {
          currentTime: number;
          timezone: string;
          format: string;
          timestamp: number;
        };
        expect(timeResult.timezone).toBe('UTC');
        expect(timeResult.format).toBe('timestamp');
        expect(typeof timeResult.currentTime).toBe('number');
        expect(timeResult.currentTime).toBeGreaterThan(Date.now() - 5000); // Within last 5 seconds
      }
    });

    it('should handle different timezones', async () => {
      const timezones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];

      for (const timezone of timezones) {
        const input = { timezone, format: 'ISO' };
        const result = await testHelper.executeToolViaEngine(input);

        expect(result.success).toBe(true);
        if (result.result && typeof result.result === 'object') {
          const timeResult = result.result as { timezone: string; currentTime: string };
          expect(timeResult.timezone).toBe(timezone);
          expect(timeResult.currentTime).toBeDefined();
        }
      }
    });

    it('should handle timezone with locale format', async () => {
      const input = { timezone: 'America/New_York', format: 'locale' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const timeResult = result.result as {
          currentTime: string;
          timezone: string;
          format: string;
        };
        expect(timeResult.timezone).toBe('America/New_York');
        expect(timeResult.format).toBe('locale');
        expect(timeResult.currentTime).toBeDefined();
      }
    });

    it('should emit proper events during execution', async () => {
      const input = { timezone: 'UTC', format: 'ISO' };
      await testHelper.executeToolViaEngine(input);

      const events = testHelper.getEventLogs();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should complete within reasonable time', async () => {
      const input = { timezone: 'UTC', format: 'ISO' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.duration).toBeLessThan(3000); // Should complete within 3 seconds
    });

    it('should return consistent timestamp across calls', async () => {
      const input = { timezone: 'UTC', format: 'timestamp' };

      const result1 = await testHelper.executeToolViaEngine(input);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      const result2 = await testHelper.executeToolViaEngine(input);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.result && result2.result && typeof result1.result === 'object' && typeof result2.result === 'object') {
        const time1 = result1.result as { currentTime: number };
        const time2 = result2.result as { currentTime: number };
        expect(time2.currentTime).toBeGreaterThanOrEqual(time1.currentTime);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid timezone gracefully', async () => {
      const input = { timezone: 'Invalid/Timezone', format: 'ISO' };
      const result = await testHelper.executeToolViaEngine(input);

      // The tool should handle this gracefully or return an error
      if (!result.success) {
        expect(result.error).toContain('Error generating time');
      }
    });

    it('should handle invalid format gracefully', async () => {
      const input = { timezone: 'UTC', format: 'invalid-format' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      // Invalid format should default to ISO
      if (result.result && typeof result.result === 'object') {
        const timeResult = result.result as { format: string; currentTime: string };
        expect(timeResult.format).toBe('invalid-format'); // Records what was requested
        expect(timeResult.currentTime).toBeDefined(); // But still generates time
      }
    });

    it('should handle null/undefined parameters', async () => {
      const inputs = [
        { timezone: null, format: 'ISO' },
        { timezone: 'UTC', format: null },
        { timezone: undefined, format: 'ISO' },
        { timezone: 'UTC', format: undefined },
      ];

      for (const input of inputs) {
        const result = await testHelper.executeToolViaEngine(input);
        expect(result.success).toBe(true);

        if (result.result && typeof result.result === 'object') {
          const timeResult = result.result as { currentTime: string };
          expect(timeResult.currentTime).toBeDefined();
        }
      }
    });

    it('should handle non-string parameters', async () => {
      const input = { timezone: 123, format: 456 };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      // Tool should handle type coercion or use defaults
      if (result.result && typeof result.result === 'object') {
        const timeResult = result.result as { currentTime: string };
        expect(timeResult.currentTime).toBeDefined();
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
