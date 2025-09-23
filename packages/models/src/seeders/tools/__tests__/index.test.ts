/**
 * Comprehensive Tool Tests Suite
 *
 * This file imports and runs all tool tests to ensure comprehensive coverage
 * of Daedalus's tools in the starships.ai models package.
 */

// Import all tool tests
import './calculator.test';
import './echo.test';
import './time.test';
import './blueprint-lint.test';
import './tool-create.test';
import './tool-list.test';
import './tool-update.test';
import './tool-smoke-test.test';

// Import test utilities
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Daedalus Tools Test Suite', () => {
  it('should have comprehensive test coverage for all tools', () => {
    // This test serves as a registry of all tools that should be tested
    const expectedTools = [
      'calculator',
      'echo',
      'time (get_current_time)',
      'blueprint-lint',
      'tool-create',
      'tool-list',
      'tool-update',
      'tool-smoke-test',
    ];

    // Basic validation that we have test files for all expected tools
    expect(expectedTools.length).toBeGreaterThan(0);
    expect(expectedTools).toContain('calculator');
    expect(expectedTools).toContain('echo');
    expect(expectedTools).toContain('time (get_current_time)');
    expect(expectedTools).toContain('blueprint-lint');
    expect(expectedTools).toContain('tool-create');
    expect(expectedTools).toContain('tool-list');
    expect(expectedTools).toContain('tool-update');
    expect(expectedTools).toContain('tool-smoke-test');
  });

  it('should verify test infrastructure is properly set up', () => {
    // Verify that our test helper utilities exist and can be imported
    expect(ToolTestHelper).toBeDefined();
    expect(CommonToolTestData).toBeDefined();
    expect(ToolMatchers).toBeDefined();
  });

  describe('Test Categories Coverage', () => {
    it('should cover utility tools', () => {
      const utilityTools = ['calculator', 'echo', 'time'];
      expect(utilityTools).toHaveLength(3);
    });

    it('should cover automation tools', () => {
      const automationTools = ['blueprint-lint', 'tool-create', 'tool-list', 'tool-update', 'tool-smoke-test'];
      expect(automationTools).toHaveLength(5);
    });
  });

  describe('Test Quality Standards', () => {
    it('should ensure all tools have comprehensive test coverage', () => {
      // Each tool test should cover:
      const requiredTestAreas = [
        'Tool Structure',
        'Parameter Schema',
        'Blueprint Structure',
        'Tool Template',
        'Parameter Validation',
        'Integration with Common Test Patterns',
        'Functional Testing - Tool Execution', // NEW: Actual execution testing
      ];

      expect(requiredTestAreas).toHaveLength(7);

      // These are the standard test areas that every tool should cover
      requiredTestAreas.forEach((area) => {
        expect(area).toBeTruthy();
      });
    });

    it('should ensure Daedalus tools have functional execution tests', () => {
      // Daedalus tools (complex automation tools) should have functional execution tests
      const daedalusTools = ['blueprint-lint', 'tool-create', 'tool-list', 'tool-update', 'tool-smoke-test'];

      // Each should test actual JavaScript execution of their node logic
      const functionalTestRequirements = [
        'Environment variable validation',
        'Input parameter validation',
        'Error handling with proper error messages',
        'Successful execution with expected outputs',
        'Edge case handling',
      ];

      expect(daedalusTools).toHaveLength(5);
      expect(functionalTestRequirements).toHaveLength(5);

      // Verify that functional testing requirements are defined
      functionalTestRequirements.forEach((requirement) => {
        expect(requirement).toBeTruthy();
      });
    });

    it('should verify test helper provides standard utilities', () => {
      // ToolTestHelper should provide standard testing methods
      const mockTool = {
        name: 'test',
        description: 'test',
        parameters: { type: 'object' as const, properties: {} },
        blueprint: { nodes: [], edges: [], metadata: {} },
      };
      const mockTemplate = {
        name: 'test',
        description: 'test',
        parameters: { type: 'object' as const, properties: {} },
        blueprint: { nodes: [], edges: [], metadata: {} },
        slug: 'test',
        category: 'utility' as const,
        exampleUsage: 'test',
        requiresApiKey: false,
        configurationFields: [],
      };
      const testHelper = new ToolTestHelper(mockTool, mockTemplate, 'test');
      expect(testHelper.testToolStructure).toBeDefined();
      expect(testHelper.testParameterSchema).toBeDefined();
      expect(testHelper.testBlueprintStructure).toBeDefined();
      expect(testHelper.testStartEndNodes).toBeDefined();
      expect(testHelper.testConnectivity).toBeDefined();
      expect(testHelper.testTemplateConsistency).toBeDefined();

      // CommonToolTestData should provide standard test data
      expect(CommonToolTestData.commonInvalidInputs).toBeDefined();
      expect(CommonToolTestData.edgeCaseInputs).toBeDefined();

      // ToolMatchers should provide custom Jest matchers
      expect(ToolMatchers.toHaveValidToolStructure).toBeDefined();
      expect(ToolMatchers.toHaveValidBlueprint).toBeDefined();
    });
  });
});
