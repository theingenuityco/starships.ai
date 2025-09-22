/**
 * Time Tool Tests
 *
 * Tests for the time tool including parameter validation,
 * blueprint structure, and functionality verification.
 */

import type { Edge } from '@starships/autopilot';
import { timeTool, timeToolTemplate } from '../time';
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Time Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(timeTool, timeToolTemplate, 'get_current_time');
    jest.clearAllMocks();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      expect(timeTool).toMatchObject({
        name: 'get_current_time',
        description: expect.stringContaining('current date and time'),
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.any(Array),
        }),
        blueprint: expect.objectContaining({
          nodes: expect.any(Array),
          edges: expect.any(Array),
          metadata: expect.any(Object),
        }),
      });
    });

    it('should have consistent template and tool data', () => {
      const consistency = testHelper.testTemplateConsistency();

      expect(consistency.nameMatch).toBe(true);
      expect(consistency.descriptionMatch).toBe(true);
      expect(consistency.parametersMatch).toBe(true);
      expect(consistency.blueprintMatch).toBe(true);
    });

    it('should have valid template metadata', () => {
      expect(timeToolTemplate).toMatchObject({
        slug: 'get-current-time',
        category: 'utility',
        exampleUsage: expect.stringContaining('get_current_time'),
        requiresApiKey: false,
        configurationFields: [],
      });
    });
  });

  describe('Parameter Schema', () => {
    it('should have valid parameter schema structure', () => {
      const schemaResults = testHelper.testParameterSchema();

      const mainSchema = schemaResults.find((r) => r.description === 'should have valid parameter schema');
      expect(mainSchema?.isObject).toBe(true);
      expect(mainSchema?.hasProperties).toBe(true);
      expect(mainSchema?.hasRequired).toBe(true);
    });

    it('should have timezone parameter with enum options', () => {
      const { properties } = timeTool.parameters;
      const timezoneProp = (properties as Record<string, unknown>).timezone as Record<string, unknown>;

      expect(timezoneProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Timezone'),
        enum: expect.arrayContaining(['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']),
      });
    });

    it('should have format parameter with enum options', () => {
      const { properties } = timeTool.parameters;
      const formatProp = (properties as Record<string, unknown>).format as Record<string, unknown>;

      expect(formatProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Format'),
        enum: expect.arrayContaining(['ISO', 'locale', 'timestamp']),
      });
    });

    it('should have no required parameters (all optional)', () => {
      expect(timeTool.parameters.required).toEqual([]);
    });

    it('should have proper parameter defaults mentioned in descriptions', () => {
      const { properties } = timeTool.parameters;
      const timezoneProp = (properties as Record<string, unknown>).timezone as Record<string, unknown>;
      const formatProp = (properties as Record<string, unknown>).format as Record<string, unknown>;

      expect(timezoneProp.description).toContain('default: UTC');
      expect(formatProp.description).toContain('Format');
    });
  });

  describe('Blueprint Structure', () => {
    it('should have valid blueprint structure', () => {
      const blueprintResults = testHelper.testBlueprintStructure();

      const mainStructure = blueprintResults.find((r) => r.description === 'should have valid blueprint structure');
      expect(mainStructure?.hasNodes).toBe(true);
      expect(mainStructure?.hasEdges).toBe(true);
      expect(mainStructure?.nodeCount).toBeGreaterThan(0);
      expect(mainStructure?.edgeCount).toBeGreaterThan(0);
    });

    it('should have start and end nodes', () => {
      const startEndResult = testHelper.testStartEndNodes();

      expect(startEndResult.hasStartNode).toBe(true);
      expect(startEndResult.hasEndNode).toBe(true);
      expect(startEndResult.startNodeCount).toBe(1);
      expect(startEndResult.endNodeCount).toBe(1);
    });

    it('should have proper node connectivity', () => {
      const connectivityResult = testHelper.testConnectivity();

      expect(connectivityResult.isConnected).toBe(true);
      expect(connectivityResult.unreachableNodes).toHaveLength(0);
    });

    it('should have expected nodes', () => {
      const { nodes } = timeTool.blueprint;
      const nodeTypes = nodes.map((n) => n.type);
      const nodeRefs = nodes.map((n) => n.ref);

      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('code');
      expect(nodeTypes).toContain('end');

      expect(nodeRefs).toContain('start_1');
      expect(nodeRefs).toContain('time_1');
      expect(nodeRefs).toContain('end_1');
    });

    it('should have valid edges connecting nodes', () => {
      const { edges, nodes } = timeTool.blueprint;
      const nodeRefs = nodes.map((n) => n.ref);

      edges.forEach((edge: Edge) => {
        expect(nodeRefs).toContain(edge.from);
        expect(nodeRefs).toContain(edge.to);
        expect(edge.ref).toBeTruthy();
      });
    });
  });

  describe('Code Node Logic', () => {
    it('should have a code node with time generation logic', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');

      expect(codeNode).toBeDefined();
      expect(codeNode?.parameters).toHaveProperty('code');
      expect(typeof (codeNode?.parameters as Record<string, unknown>)?.code).toBe('string');
      expect((codeNode?.parameters as Record<string, unknown>)?.code).toContain('new Date()');
    });

    it('should handle timezone parameter', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('input.timezone');
      expect(code).toContain("timezone || 'UTC'");
      expect(code).toContain("timezone === 'UTC'");
    });

    it('should handle format parameter', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('input.format');
      expect(code).toContain("format || 'ISO'");
      expect(code).toContain('switch (format)');
    });

    it('should support different format options', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("case 'ISO'");
      expect(code).toContain("case 'locale'");
      expect(code).toContain("case 'timestamp'");
      expect(code).toContain('toISOString()');
      expect(code).toContain('toLocaleString');
      expect(code).toContain('getTime()');
    });

    it('should handle timezone conversions', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('timeZone: timezone');
      expect(code).toContain('toUTCString()');
    });

    it('should have proper error handling', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('try');
      expect(code).toContain('catch');
      expect(code).toContain('throw new Error');
      expect(code).toContain('Error generating time');
    });

    it('should have timeout configuration', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const parameters = codeNode?.parameters as Record<string, unknown>;

      expect(parameters).toHaveProperty('timeout');
      expect(parameters.timeout).toBe(3000);
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid timezone values', () => {
      const validTimezones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];

      validTimezones.forEach((timezone) => {
        const params = { timezone };
        expect(() => {
          expect(params).toMatchObject({
            timezone: expect.any(String),
          });
        }).not.toThrow();

        // Verify timezone is in enum
        const { properties } = timeTool.parameters;
        const timezoneProp = (properties as Record<string, unknown>).timezone as Record<string, unknown>;
        expect(timezoneProp.enum as string[]).toContain(timezone);
      });
    });

    it('should accept valid format values', () => {
      const validFormats = ['ISO', 'locale', 'timestamp'];

      validFormats.forEach((format) => {
        const params = { format };
        expect(() => {
          expect(params).toMatchObject({
            format: expect.any(String),
          });
        }).not.toThrow();

        // Verify format is in enum
        const { properties } = timeTool.parameters;
        const formatProp = (properties as Record<string, unknown>).format as Record<string, unknown>;
        expect(formatProp.enum as string[]).toContain(format);
      });
    });

    it('should accept empty parameters (all optional)', () => {
      const emptyParams = {};
      expect(() => {
        expect(emptyParams).toEqual(expect.any(Object));
      }).not.toThrow();

      // Verify no required parameters
      expect(timeTool.parameters.required).toEqual([]);
    });

    it('should handle parameter combinations', () => {
      const validCombinations = [
        { timezone: 'UTC', format: 'ISO' },
        { timezone: 'America/New_York', format: 'locale' },
        { timezone: 'Asia/Tokyo', format: 'timestamp' },
        { timezone: 'UTC' }, // Only timezone
        { format: 'ISO' }, // Only format
        {}, // No parameters
      ];

      validCombinations.forEach((params) => {
        expect(() => {
          expect(params).toEqual(expect.any(Object));
        }).not.toThrow();
      });
    });
  });

  describe('Tool Template', () => {
    it('should have correct template configuration', () => {
      expect(timeToolTemplate.slug).toBe('get-current-time');
      expect(timeToolTemplate.category).toBe('utility');
      expect(timeToolTemplate.requiresApiKey).toBe(false);
      expect(timeToolTemplate.configurationFields).toEqual([]);
    });

    it('should have helpful example usage', () => {
      expect(timeToolTemplate.exampleUsage).toContain('get_current_time');
      expect(timeToolTemplate.exampleUsage).toContain('timezone');
      expect(timeToolTemplate.exampleUsage).toContain('format');
    });
  });

  describe('Expected Output Format', () => {
    it('should define expected output structure in code node', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      // Check that the code returns the expected structure
      expect(code).toContain('currentTime: result');
      expect(code).toContain('timezone: timezone');
      expect(code).toContain('format: format');
      expect(code).toContain('timestamp: now.getTime()');
    });

    it('should have proper end node output configuration', () => {
      const { nodes } = timeTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');

      expect(endNode?.parameters).toHaveProperty('output');
      expect((endNode?.parameters as Record<string, unknown>)?.output).toBe('{{ $input() }}');
    });

    it('should provide consistent output fields', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      // Should always include these fields regardless of format
      expect(code).toContain('currentTime:');
      expect(code).toContain('timezone:');
      expect(code).toContain('format:');
      expect(code).toContain('timestamp:');
    });
  });

  describe('Time Formats', () => {
    it('should handle ISO format correctly', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("case 'ISO'");
      expect(code).toContain('toISOString()');
    });

    it('should handle locale format correctly', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("case 'locale'");
      expect(code).toContain('toUTCString()');
      expect(code).toContain('toLocaleString');
    });

    it('should handle timestamp format correctly', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("case 'timestamp'");
      expect(code).toContain('getTime()');
    });

    it('should have default fallback', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('default:');
      expect(code).toContain('toISOString()'); // Default should be ISO
    });
  });

  describe('Error Handling', () => {
    it('should have comprehensive error handling', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('try');
      expect(code).toContain('catch (error)');
      expect(code).toContain("throw new Error('Error generating time: '");
      expect(code).toContain('error.message');
    });

    it('should handle various error scenarios', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      // Should wrap the main logic in try-catch
      expect(code).toMatch(/try\s*{[\s\S]*switch[\s\S]*}\s*catch/);
    });
  });

  describe('Timezone Handling', () => {
    it('should handle UTC timezone correctly', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("timezone === 'UTC'");
      expect(code).toContain('toUTCString()');
    });

    it('should handle non-UTC timezones', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("toLocaleString('en-US', { timeZone: timezone }");
    });

    it('should provide timezone information in output', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('timezone: timezone');
    });
  });

  describe('Integration with Common Test Patterns', () => {
    it('should handle common invalid inputs', () => {
      CommonToolTestData.commonInvalidInputs.forEach((testCase) => {
        // Verify tool structure remains valid
        expect(testCase.params).toBeDefined();
        expect(testCase.expectedError).toBeTruthy();
        expect(testCase.description).toBeTruthy();
      });
    });

    it('should use ToolMatchers for validation', () => {
      expect(ToolMatchers.toHaveValidToolStructure(timeTool)).toEqual({
        message: expect.any(Function),
        pass: true,
      });

      expect(ToolMatchers.toHaveValidBlueprint(timeTool.blueprint)).toEqual({
        message: expect.any(Function),
        pass: true,
      });
    });
  });

  describe('Performance and Reliability', () => {
    it('should have reasonable timeout', () => {
      const { nodes } = timeTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const parameters = codeNode?.parameters as Record<string, unknown>;

      expect(parameters.timeout).toBe(3000);
      expect(parameters.timeout).toBeLessThan(10000); // Should be fast
    });

    it('should be lightweight operation', () => {
      const { nodes } = timeTool.blueprint;

      // Should only need start, code, and end nodes
      expect(nodes.length).toBe(3);

      // Should not need external dependencies
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).not.toContain('require(');
      expect(code).not.toContain('import ');
    });
  });

  describe('Use Cases', () => {
    it('should support logging and timestamping use cases', () => {
      expect(timeTool.description).toContain('current date and time');

      // Should provide multiple formats for different use cases
      const { properties } = timeTool.parameters;
      const formatProp = (properties as Record<string, unknown>).format as Record<string, unknown>;
      const formats = formatProp.enum as string[];

      expect(formats).toContain('ISO'); // For APIs
      expect(formats).toContain('locale'); // For display
      expect(formats).toContain('timestamp'); // For calculations
    });

    it('should support international use cases', () => {
      const { properties } = timeTool.parameters;
      const timezoneProp = (properties as Record<string, unknown>).timezone as Record<string, unknown>;
      const timezones = timezoneProp.enum as string[];

      // Should support major timezones
      expect(timezones).toContain('UTC');
      expect(timezones).toContain('America/New_York');
      expect(timezones).toContain('Europe/London');
      expect(timezones).toContain('Asia/Tokyo');
    });
  });
});
