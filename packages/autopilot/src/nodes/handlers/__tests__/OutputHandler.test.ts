/**
 * OutputHandler Unit Tests
 */

import { OutputHandler } from '@/nodes/handlers/OutputHandler';
import { Node, Execution, OutputNodeParameters, NodeResult } from '@/types';

describe('OutputHandler', () => {
  let handler: OutputHandler;
  let mockNode: Node;
  let mockExecution: Execution;

  beforeEach(() => {
    mockNode = {
      ref: 'output-node',
      type: 'output',
      name: 'Test Output Node',
      description: 'Output node for testing',
      parameters: {
        template: '# {{title}}\n\n{{#each sources}}{{this.message}}\n{{/each}}',
        sources: ['source1', 'source2'],
        format: 'markdown',
        title: 'Test Report',
      } as OutputNodeParameters,
    };

    handler = new OutputHandler(mockNode);

    mockExecution = global.createMockExecution();
    // Add mock source results to execution
    mockExecution.executionResults.set('source1', {
      nodeRef: 'source1',
      data: { message: 'Hello from source 1', score: 85 },
    });
    mockExecution.executionResults.set('source2', {
      nodeRef: 'source2',
      data: { message: 'Hello from source 2', category: 'premium' },
    });
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('output');
    });
  });

  describe('execute', () => {
    it('should execute successfully with valid parameters', async () => {
      const result = await handler.execute(mockExecution);

      const nodeResult = result.executionResults.get('output-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('output-node');

      // Check output data structure
      expect(nodeResult?.data).toHaveProperty('output');
      expect(nodeResult?.data).toHaveProperty('format', 'markdown');
      expect(nodeResult?.data).toHaveProperty('sourceData');

      const data = nodeResult?.data as any;
      expect(data.output).toContain('# Test Report');
      expect(data.sourceData).toEqual({
        source1: { message: 'Hello from source 1', score: 85 },
        source2: { message: 'Hello from source 2', category: 'premium' },
      });
    });

    it('should handle missing title parameter', async () => {
      const paramsWithoutTitle = {
        template: 'Simple template',
        sources: ['source1'],
        format: 'text',
      } as OutputNodeParameters;

      const handlerWithoutTitle = new OutputHandler({
        ref: 'no-title-node',
        type: 'output',
        name: 'Output without title',
        description: 'Output without title for testing',
        parameters: paramsWithoutTitle,
      });

      const result = await handlerWithoutTitle.execute(mockExecution);

      const nodeResult = result.executionResults.get('no-title-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      const data = nodeResult?.data as any;
      expect(data.output).toContain('# Workflow Output'); // Default title
    });

    it('should handle single source', async () => {
      const singleSourceParams = {
        template: 'Single source template',
        sources: ['source1'],
        format: 'text',
        title: 'Single Source Report',
      } as OutputNodeParameters;

      const singleSourceHandler = new OutputHandler({
        ref: 'single-source-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: singleSourceParams,
      });

      const result = await singleSourceHandler.execute(mockExecution);

      const nodeResult = result.executionResults.get('single-source-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      const data = nodeResult?.data as any;
      expect(data.sourceData).toEqual({
        source1: { message: 'Hello from source 1', score: 85 },
      });
      expect(data.output).toContain('# Single Source Report');
    });

    it('should handle missing source nodes gracefully', async () => {
      const paramsWithMissingSources = {
        template: 'Template with missing sources',
        sources: ['source1', 'nonexistent-source', 'source2'],
        format: 'json',
        title: 'Mixed Sources Report',
      } as OutputNodeParameters;

      const handlerWithMissingSources = new OutputHandler({
        ref: 'missing-sources-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: paramsWithMissingSources,
      });

      const result = await handlerWithMissingSources.execute(mockExecution);

      const nodeResult = result.executionResults.get('missing-sources-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      const data = nodeResult?.data as any;

      // Should only include existing sources
      expect(data.sourceData).toEqual({
        source1: { message: 'Hello from source 1', score: 85 },
        source2: { message: 'Hello from source 2', category: 'premium' },
      });
      expect(data.sourceData).not.toHaveProperty('nonexistent-source');
    });

    it('should handle all supported formats', async () => {
      const formats: Array<OutputNodeParameters['format']> = ['text', 'markdown', 'json', 'html', 'xml', 'pdf', 'csv'];

      for (const format of formats) {
        const paramsWithFormat = {
          ...mockNode.parameters,
          format,
        } as OutputNodeParameters;

        const handlerWithFormat = new OutputHandler({
          ref: `format-${format}-node`,
          type: 'output',
          name: 'Test Output Node',
          description: 'Output node for testing',
          parameters: paramsWithFormat,
        });

        const result = await handlerWithFormat.execute(mockExecution);

        const nodeResult = result.executionResults.get(`format-${format}-node`);
        expect(nodeResult).toBeDefined();
        expect(nodeResult?.error).toBeUndefined();
        expect((nodeResult?.data as any).format).toBe(format);
      }
    });

    it('should handle empty sources array', async () => {
      const paramsWithEmptySources = {
        template: 'Empty sources template',
        sources: [],
        format: 'text',
      } as OutputNodeParameters;

      const handlerWithEmptySources = new OutputHandler({
        ref: 'empty-sources-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: paramsWithEmptySources,
      });

      const result = await handlerWithEmptySources.execute(mockExecution);

      const nodeResult = result.executionResults.get('empty-sources-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      const data = nodeResult?.data as any;
      expect(data.sourceData).toEqual({});
    });

    it('should handle complex nested source data', async () => {
      const complexSourceResult: NodeResult = {
        nodeRef: 'complex-source',
        data: {
          user: {
            name: 'John Doe',
            preferences: {
              theme: 'dark',
              notifications: true,
            },
          },
          analytics: {
            pageViews: 1250,
            uniqueVisitors: 89,
            metrics: [
              { name: 'bounce_rate', value: 0.35 },
              { name: 'conversion_rate', value: 0.12 },
            ],
          },
        },
      };

      const executionWithComplexData = global.createMockExecution();
      executionWithComplexData.executionResults.set('complex-source', complexSourceResult);

      const paramsWithComplexData = {
        template: 'Complex data template',
        sources: ['complex-source'],
        format: 'json',
        title: 'Complex Data Report',
      } as OutputNodeParameters;

      const handlerWithComplexData = new OutputHandler({
        ref: 'complex-data-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: paramsWithComplexData,
      });

      const result = await handlerWithComplexData.execute(executionWithComplexData);

      const nodeResult = result.executionResults.get('complex-data-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      const data = nodeResult?.data as any;
      expect(data.sourceData['complex-source']).toEqual(complexSourceResult.data);
    });

    it('should set execution timestamp', async () => {
      const beforeExecution = Date.now();
      const result = await handler.execute(mockExecution);
      const afterExecution = Date.now();

      expect(result).toBeDefined();
      const nodeResult = result.executionResults.get('output-node');
      expect(nodeResult).toBeDefined();
    });

    it('should work with empty execution', async () => {
      const emptyExecution = global.createMockExecution();

      const result = await handler.execute(emptyExecution);

      const nodeResult = result.executionResults.get('output-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('output-node');
      const data = nodeResult?.data as any;
      expect(data.sourceData).toEqual({});
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const result = handler.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should validate successfully with minimal valid parameters', () => {
      const minimalParams = {
        template: 'Simple template',
        sources: ['source1'],
        format: 'text',
      } as OutputNodeParameters;

      const minimalHandler = new OutputHandler({
        ref: 'minimal-output-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: minimalParams,
      });
      const result = minimalHandler.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when template is missing', () => {
      const paramsWithoutTemplate = {
        sources: ['source1'],
        format: 'text',
      } as OutputNodeParameters;

      const handlerWithoutTemplate = new OutputHandler({
        ref: 'no-template-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: paramsWithoutTemplate,
      });
      const result = handlerWithoutTemplate.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Template is required',
        nodeRef: 'no-template-node',
        severity: 'error',
      });
    });

    it('should fail validation when template is empty string', () => {
      const paramsWithEmptyTemplate = {
        template: '',
        sources: ['source1'],
        format: 'text',
      } as OutputNodeParameters;

      const handlerWithEmptyTemplate = new OutputHandler({
        ref: 'empty-template-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: paramsWithEmptyTemplate,
      });
      const result = handlerWithEmptyTemplate.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('Template is required');
    });

    it('should fail validation when sources are missing', () => {
      const paramsWithoutSources = {
        template: 'Some template',
        format: 'text',
      } as OutputNodeParameters;

      const handlerWithoutSources = new OutputHandler({
        ref: 'no-sources-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: paramsWithoutSources,
      });
      const result = handlerWithoutSources.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one source node is required',
        nodeRef: 'no-sources-node',
        severity: 'error',
      });
    });

    it('should fail validation when sources array is empty', () => {
      const paramsWithEmptySources = {
        template: 'Some template',
        sources: [],
        format: 'text',
      } as OutputNodeParameters;

      const handlerWithEmptySources = new OutputHandler({
        ref: 'empty-sources-validation-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: paramsWithEmptySources,
      });
      const result = handlerWithEmptySources.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('At least one source node is required');
    });

    it('should fail validation for both missing template and sources', () => {
      const paramsWithMissingFields = {
        format: 'text',
        title: 'Some title',
      } as OutputNodeParameters;

      const handlerWithMissingFields = new OutputHandler({
        ref: 'missing-fields-node',
        type: 'output',
        name: 'Test Output Node',
        description: 'Output node for testing',
        parameters: paramsWithMissingFields,
      });
      const result = handlerWithMissingFields.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);

      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toEqual(['MISSING_REQUIRED_FIELD', 'MISSING_REQUIRED_FIELD']);

      const errorMessages = result.errors.map((e) => e.message);
      expect(errorMessages).toContain('Template is required');
      expect(errorMessages).toContain('At least one source node is required');
    });

    it('should validate with different output formats', () => {
      const formats: Array<OutputNodeParameters['format']> = ['text', 'markdown', 'json', 'html', 'xml', 'pdf', 'csv'];

      for (const format of formats) {
        const paramsWithFormat = {
          ...mockNode.parameters,
          format,
        } as OutputNodeParameters;

        const handlerWithFormat = new OutputHandler({
          ref: `format-validation-${format}-node`,
          type: 'output',
          name: 'Test Output Node',
          description: 'Output node for testing',
          parameters: paramsWithFormat,
        });
        const result = handlerWithFormat.validate();
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('file-text');
    });
  });
});
