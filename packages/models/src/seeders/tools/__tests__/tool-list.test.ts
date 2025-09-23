/**
 * Tool List Tool Tests
 * End-to-end tests for the tool_list tool using autopilot Tool node
 */

import { toolListTool, toolListToolTemplate } from '../tool-list';
import { ToolTestHelper, CommonToolTestData } from './tool-test-helper';

describe('Tool List Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(toolListTool, toolListToolTemplate, 'tool_list');
    testHelper.clearEventLogs();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      const result = testHelper.testToolStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct tool name', () => {
      expect(toolListTool.name).toBe('tool_list');
    });

    it('should have descriptive description', () => {
      expect(toolListTool.description).toContain('List all tools');
      expect(toolListTool.description.length).toBeGreaterThan(10);
    });
  });

  describe('Parameter Schema', () => {
    it('should have valid parameter schema', () => {
      const result = testHelper.testParameterSchema();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have no required parameters', () => {
      expect(toolListTool.parameters.required).toBeUndefined();
    });

    it('should define empty properties object', () => {
      expect(toolListTool.parameters.properties).toEqual({});
    });
  });

  describe('Blueprint Structure', () => {
    it('should have valid blueprint structure', () => {
      const result = testHelper.testBlueprintStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have start and end nodes', () => {
      const blueprint = toolListTool.blueprint;
      const hasStart = blueprint.nodes.some((n) => n.type === 'start');
      const hasEnd = blueprint.nodes.some((n) => n.type === 'end');

      expect(hasStart).toBe(true);
      expect(hasEnd).toBe(true);
    });

    it('should have prepare, http_request, and summarize nodes', () => {
      const blueprint = toolListTool.blueprint;
      const nodeTypes = blueprint.nodes.map((n) => n.type);

      expect(nodeTypes).toContain('code'); // prepare and summarize
      expect(nodeTypes).toContain('http_request');
    });

    it('should have proper node connectivity', () => {
      const blueprint = toolListTool.blueprint;
      const nodeRefs = new Set(blueprint.nodes.map((n) => n.ref));

      for (const edge of blueprint.edges) {
        expect(nodeRefs.has(edge.from)).toBe(true);
        expect(nodeRefs.has(edge.to)).toBe(true);
      }
    });

    it('should have sequential flow: prepare -> http -> summarize -> end', () => {
      const blueprint = toolListTool.blueprint;
      const edges = blueprint.edges;

      // Find the flow
      const prepareNode = blueprint.nodes.find((n) => n.ref === 'prepare');
      const httpNode = blueprint.nodes.find((n) => n.ref === 'http_list');
      const summarizeNode = blueprint.nodes.find((n) => n.ref === 'summarize');

      expect(prepareNode).toBeDefined();
      expect(httpNode).toBeDefined();
      expect(summarizeNode).toBeDefined();

      // Check edge connections
      expect(edges.some((e) => e.from === 'prepare' && e.to === 'http_list')).toBe(true);
      expect(edges.some((e) => e.from === 'http_list' && e.to === 'summarize')).toBe(true);
      expect(edges.some((e) => e.from === 'summarize' && e.to === 'end_1')).toBe(true);
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      const result = testHelper.testTemplateConsistency();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct template metadata', () => {
      expect(toolListToolTemplate.slug).toBe('tool-list');
      expect(toolListToolTemplate.category).toBe('automation');
      expect(toolListToolTemplate.requiresApiKey).toBe(false);
    });

    it('should have example usage', () => {
      expect(toolListToolTemplate.exampleUsage).toBeDefined();
      if (toolListToolTemplate.exampleUsage) {
        expect(toolListToolTemplate.exampleUsage.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Tool Execution with Mock Environment', () => {
    it('should require environment variables', async () => {
      const input = {};
      const result = await testHelper.executeToolViaEngine(input);

      // Should fail due to missing environment variables
      expect(result.success).toBe(false);
      expect(result.error).toContain('baseUrl is required');
    });

    it('should fail without auth token', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        STARSHIP_ID: 'test-starship-123',
        // Missing AUTH_TOKEN
      };

      const input = {};
      const result = await testHelper.executeToolViaEngine(input, mockEnv);

      expect(result.success).toBe(false);
      expect(result.error).toContain('authToken is required');
    });

    it('should fail without starship ID', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.test.com',
        AUTH_TOKEN: 'mock-token',
        // Missing STARSHIP_ID
      };

      const input = {};
      const result = await testHelper.executeToolViaEngine(input, mockEnv);

      expect(result.success).toBe(false);
      expect(result.error).toContain('starshipId is required');
    });

    it('should prepare correct API request parameters', async () => {
      const mockEnv = CommonToolTestData.MOCK_API_ENV;

      const input = {};
      const result = await testHelper.executeToolViaEngine(input, mockEnv);

      // The tool will fail at HTTP request since we don't have a real server
      // but we can verify it got past the preparation phase
      expect(result.success).toBe(false);
      // Should fail at HTTP request, not at parameter preparation
      expect(result.error).not.toContain('baseUrl is required');
      expect(result.error).not.toContain('authToken is required');
      expect(result.error).not.toContain('starshipId is required');
    });

    it('should build correct URL for API call', async () => {
      const mockEnv = {
        BASE_URL: 'https://api.example.com/',
        AUTH_TOKEN: 'test-token-123',
        STARSHIP_ID: 'starship-456',
      };

      const input = {};
      const result = await testHelper.executeToolViaEngine(input, mockEnv);

      // Should fail at HTTP request but not at URL preparation
      expect(result.success).toBe(false);
      // The error should be related to HTTP request, not URL building
      if (result.error) {
        expect(result.error).not.toContain('baseUrl');
        expect(result.error).not.toContain('authToken');
        expect(result.error).not.toContain('starshipId');
      }
    });

    it('should handle trailing slashes in BASE_URL', async () => {
      const mockEnvWithTrailingSlash = {
        BASE_URL: 'https://api.example.com///',
        AUTH_TOKEN: 'test-token',
        STARSHIP_ID: 'starship-123',
      };

      const input = {};
      const result = await testHelper.executeToolViaEngine(input, mockEnvWithTrailingSlash);

      // Should handle trailing slashes gracefully
      expect(result.success).toBe(false);
      // Should fail at HTTP request, not URL parsing
      expect(result.error).not.toContain('baseUrl');
    });

    it('should emit proper events during execution', async () => {
      const mockEnv = CommonToolTestData.MOCK_API_ENV;

      const input = {};
      await testHelper.executeToolViaEngine(input, mockEnv);

      const events = testHelper.getEventLogs();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should complete within reasonable time even on failure', async () => {
      const mockEnv = CommonToolTestData.MOCK_API_ENV;

      const input = {};
      const result = await testHelper.executeToolViaEngine(input, mockEnv);

      // Should fail quickly due to no real HTTP server
      expect(result.duration).toBeLessThan(10000); // Within 10 seconds
    });
  });

  describe('Data Processing Logic', () => {
    it('should have code logic for request preparation', () => {
      const blueprint = toolListTool.blueprint;
      const prepareNode = blueprint.nodes.find((n) => n.ref === 'prepare');

      expect(prepareNode).toBeDefined();
      expect(prepareNode?.type).toBe('code');
      if (prepareNode?.parameters) {
        const params = prepareNode.parameters as { code: string };
        expect(params.code).toBeDefined();
        expect(params.code).toContain('baseUrl');
        expect(params.code).toContain('authToken');
        expect(params.code).toContain('starshipId');
      }
    });

    it('should have code logic for response summarization', () => {
      const blueprint = toolListTool.blueprint;
      const summarizeNode = blueprint.nodes.find((n) => n.ref === 'summarize');

      expect(summarizeNode).toBeDefined();
      expect(summarizeNode?.type).toBe('code');
      if (summarizeNode?.parameters) {
        const params = summarizeNode.parameters as { code: string };
        expect(params.code).toBeDefined();
        expect(params.code).toContain('map'); // Should process array
        expect(params.code).toContain('id');
        expect(params.code).toContain('slug');
        expect(params.code).toContain('name');
      }
    });

    it('should configure HTTP request with proper parameters', () => {
      const blueprint = toolListTool.blueprint;
      const httpNode = blueprint.nodes.find((n) => n.ref === 'http_list');

      expect(httpNode).toBeDefined();
      expect(httpNode?.type).toBe('http_request');
      if (httpNode?.parameters) {
        const params = httpNode.parameters as Record<string, unknown>;
        expect(params.url).toBeDefined();
        expect(params.method).toBeDefined();
        expect(params.headers).toBeDefined();
        expect(params.timeout).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle empty environment variables', async () => {
      const mockEnv = {
        BASE_URL: '',
        AUTH_TOKEN: '',
        STARSHIP_ID: '',
      };

      const input = {};
      const result = await testHelper.executeToolViaEngine(input, mockEnv);

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should handle null environment variables', async () => {
      const input = {};
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should handle malformed input gracefully', async () => {
      const mockEnv = CommonToolTestData.MOCK_API_ENV;

      // Tool doesn't require input parameters, so malformed input should still work
      const inputs = [{ invalid: 'parameter' }, 123, 'string-input', null, undefined];

      for (const input of inputs) {
        const result = await testHelper.executeToolViaEngine(input, mockEnv);

        // Should fail at HTTP request, not input processing
        expect(result.success).toBe(false);
        expect(result.error).not.toContain('invalid');
      }
    });
  });

  describe('API Integration Points', () => {
    it('should construct correct API endpoint', () => {
      const blueprint = toolListTool.blueprint;
      const prepareNode = blueprint.nodes.find((n) => n.ref === 'prepare');

      if (prepareNode?.parameters) {
        const params = prepareNode.parameters as { code: string };
        expect(params.code).toContain('/starships/');
        expect(params.code).toContain('/tools');
        expect(params.code).toContain('starshipId');
      }
    });

    it('should set correct HTTP method', () => {
      const blueprint = toolListTool.blueprint;
      const httpNode = blueprint.nodes.find((n) => n.ref === 'http_list');

      if (httpNode?.parameters) {
        // The method is a template expression, so check the prepare node
        const prepareNode = blueprint.nodes.find((n) => n.ref === 'prepare');
        if (prepareNode?.parameters) {
          const prepareParams = prepareNode.parameters as { code: string };
          expect(prepareParams.code).toContain("method: 'GET'");
        }
      }
    });

    it('should include authorization header', () => {
      const blueprint = toolListTool.blueprint;
      const prepareNode = blueprint.nodes.find((n) => n.ref === 'prepare');

      if (prepareNode?.parameters) {
        const params = prepareNode.parameters as { code: string };
        expect(params.code).toContain('Authorization');
        expect(params.code).toContain('Bearer');
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
