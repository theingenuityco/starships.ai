/**
 * Tools Test Suite Index
 * Comprehensive test coverage for all tool templates using end-to-end testing
 */

import { ALL_TOOL_TEMPLATES } from '../index';
import type { Node } from '@starships/autopilot';

describe('Tool Templates Test Suite', () => {
  describe('Tool Suite Integration', () => {
    it('should have all expected tools available', () => {
      expect(ALL_TOOL_TEMPLATES).toBeDefined();
      expect(Array.isArray(ALL_TOOL_TEMPLATES)).toBe(true);
      expect(ALL_TOOL_TEMPLATES.length).toBeGreaterThan(0);

      // Verify we have the expected tools
      const toolNames = ALL_TOOL_TEMPLATES.map((template) => template.name);
      expect(toolNames).toContain('calculator');
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('get_current_time');
      expect(toolNames).toContain('blueprint_lint');
      expect(toolNames).toContain('tool_list');
    });

    it('should have unique tool names', () => {
      const toolNames = ALL_TOOL_TEMPLATES.map((template) => template.name);
      const uniqueNames = new Set(toolNames);

      expect(toolNames.length).toBe(uniqueNames.size);
    });

    it('should have unique tool slugs', () => {
      const toolSlugs = ALL_TOOL_TEMPLATES.map((template) => template.slug);
      const uniqueSlugs = new Set(toolSlugs);

      expect(toolSlugs.length).toBe(uniqueSlugs.size);
    });

    it('should have consistent template structure', () => {
      for (const template of ALL_TOOL_TEMPLATES) {
        // Required fields
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.parameters).toBeDefined();
        expect(template.blueprint).toBeDefined();
        expect(template.slug).toBeDefined();
        expect(template.category).toBeDefined();
        expect(typeof template.requiresApiKey).toBe('boolean');

        // Blueprint structure
        expect(template.blueprint.nodes).toBeDefined();
        expect(Array.isArray(template.blueprint.nodes)).toBe(true);
        expect(template.blueprint.edges).toBeDefined();
        expect(Array.isArray(template.blueprint.edges)).toBe(true);

        // Parameter structure
        expect(template.parameters.type).toBe('object');
        expect(template.parameters.properties).toBeDefined();
      }
    });

    it('should have valid categories', () => {
      const validCategories = ['utility', 'automation', 'analysis', 'communication'];

      for (const template of ALL_TOOL_TEMPLATES) {
        expect(validCategories).toContain(template.category);
      }
    });

    it('should have connected blueprints', () => {
      for (const template of ALL_TOOL_TEMPLATES) {
        const nodeRefs = new Set(template.blueprint.nodes.map((n: Node) => n.ref));

        // All edges should reference existing nodes
        for (const edge of template.blueprint.edges) {
          expect(nodeRefs.has(edge.from)).toBe(true);
          expect(nodeRefs.has(edge.to)).toBe(true);
        }

        // Should have start and end nodes
        const nodeTypes = template.blueprint.nodes.map((n: Node) => n.type);
        expect(nodeTypes).toContain('start');
        expect(nodeTypes).toContain('end');
      }
    });
  });

  describe('Tool Coverage', () => {
    it('should test utility tools', () => {
      const utilityTools = ALL_TOOL_TEMPLATES.filter((t) => t.category === 'utility');

      expect(utilityTools.length).toBeGreaterThan(0);

      const utilityNames = utilityTools.map((t) => t.name);
      expect(utilityNames).toContain('calculator');
      expect(utilityNames).toContain('echo');
      expect(utilityNames).toContain('get_current_time');
    });

    it('should test automation tools', () => {
      const automationTools = ALL_TOOL_TEMPLATES.filter((t) => t.category === 'automation');

      expect(automationTools.length).toBeGreaterThan(0);

      const automationNames = automationTools.map((t) => t.name);
      expect(automationNames).toContain('blueprint_lint');
      expect(automationNames).toContain('tool_list');
    });

    it('should have comprehensive test coverage', () => {
      // Ensure we have tests for all available tools
      expect(ALL_TOOL_TEMPLATES.length).toBeGreaterThanOrEqual(5);

      // Each tool should have its required components
      for (const template of ALL_TOOL_TEMPLATES) {
        expect(template.name).toBeTruthy();
        expect(template.slug).toBeTruthy();
        expect(template.blueprint).toBeTruthy();
        expect(template.parameters).toBeTruthy();
      }
    });
  });
});
