/**
 * OutputHandler Unit Tests
 */

import { OutputHandler } from '../OutputHandler';
import { Node, ExecutionContext, OutputNodeParameters, NodeResult } from '../../../types';

describe('OutputHandler', () => {
  let handler: OutputHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;
  let mockSourceResults: Map<string, NodeResult>;

  beforeEach(() => {
    // Create mock source results
    mockSourceResults = new Map([
      ['source1', {
        nodeId: 'source1',
        success: true,
        data: { message: 'Hello from source 1', score: 85 },
        executedAt: new Date().toISOString(),
        duration: 100
      }],
      ['source2', {
        nodeId: 'source2',
        success: true,
        data: { message: 'Hello from source 2', category: 'premium' },
        executedAt: new Date().toISOString(),
        duration: 200
      }]
    ]);

    mockNode = {
      id: 'output-node',
      type: 'output',
      name: 'Test Output Node',
      description: 'Output node for testing',
      parameters: {
        template: '# {{title}}\n\n{{#each sources}}{{this.message}}\n{{/each}}',
        sources: ['source1', 'source2'],
        format: 'markdown',
        title: 'Test Report'
      } as OutputNodeParameters
    };

    handler = new OutputHandler(mockNode.parameters, mockNode.id);

    mockContext = {
      ...global.createMockContext(),
      previousResults: mockSourceResults
    };
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('output');
    });
  });

  describe('execute', () => {
    it('should execute successfully with valid parameters', async () => {
      const result = await handler.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('output-node');
      expect(result.duration).toBe(50);
      expect(result.executedAt).toBeDefined();
      expect(result.error).toBeUndefined();
      
      // Check output data structure
      expect(result.data).toHaveProperty('output');
      expect(result.data).toHaveProperty('format', 'markdown');
      expect(result.data).toHaveProperty('sourceData');
      
      const data = result.data as any;
      expect(data.output).toContain('# Test Report');
      expect(data.sourceData).toEqual({
        'source1': { message: 'Hello from source 1', score: 85 },
        'source2': { message: 'Hello from source 2', category: 'premium' }
      });
    });

    it('should handle missing title parameter', async () => {
      const paramsWithoutTitle = {
        template: 'Simple template',
        sources: ['source1'],
        format: 'text'
      } as OutputNodeParameters;
      
      const handlerWithoutTitle = new OutputHandler(paramsWithoutTitle, 'no-title-node');
      
      const result = await handlerWithoutTitle.execute(mockContext);
      
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.output).toContain('# Workflow Output'); // Default title
    });

    it('should handle single source', async () => {
      const singleSourceParams = {
        template: 'Single source template',
        sources: ['source1'],
        format: 'text',
        title: 'Single Source Report'
      } as OutputNodeParameters;
      
      const singleSourceHandler = new OutputHandler(singleSourceParams, 'single-source-node');
      
      const result = await singleSourceHandler.execute(mockContext);
      
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.sourceData).toEqual({
        'source1': { message: 'Hello from source 1', score: 85 }
      });
      expect(data.output).toContain('# Single Source Report');
    });

    it('should handle missing source nodes gracefully', async () => {
      const paramsWithMissingSources = {
        template: 'Template with missing sources',
        sources: ['source1', 'nonexistent-source', 'source2'],
        format: 'json',
        title: 'Mixed Sources Report'
      } as OutputNodeParameters;
      
      const handlerWithMissingSources = new OutputHandler(paramsWithMissingSources, 'missing-sources-node');
      
      const result = await handlerWithMissingSources.execute(mockContext);
      
      expect(result.success).toBe(true);
      const data = result.data as any;
      
      // Should only include existing sources
      expect(data.sourceData).toEqual({
        'source1': { message: 'Hello from source 1', score: 85 },
        'source2': { message: 'Hello from source 2', category: 'premium' }
      });
      expect(data.sourceData).not.toHaveProperty('nonexistent-source');
    });

    it('should handle all supported formats', async () => {
      const formats: Array<OutputNodeParameters['format']> = [
        'text', 'markdown', 'json', 'html', 'xml', 'pdf', 'csv'
      ];
      
      for (const format of formats) {
        const paramsWithFormat = {
          ...mockNode.parameters,
          format
        } as OutputNodeParameters;
        
        const handlerWithFormat = new OutputHandler(paramsWithFormat, `format-${format}-node`);
        
        const result = await handlerWithFormat.execute(mockContext);
        
        expect(result.success).toBe(true);
        expect((result.data as any).format).toBe(format);
      }
    });

    it('should handle empty sources array', async () => {
      const paramsWithEmptySources = {
        template: 'Empty sources template',
        sources: [],
        format: 'text'
      } as OutputNodeParameters;
      
      const handlerWithEmptySources = new OutputHandler(paramsWithEmptySources, 'empty-sources-node');
      
      const result = await handlerWithEmptySources.execute(mockContext);
      
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.sourceData).toEqual({});
    });

    it('should handle complex nested source data', async () => {
      const complexSourceResult: NodeResult = {
        nodeId: 'complex-source',
        success: true,
        data: {
          user: {
            name: 'John Doe',
            preferences: {
              theme: 'dark',
              notifications: true
            }
          },
          analytics: {
            pageViews: 1250,
            uniqueVisitors: 89,
            metrics: [
              { name: 'bounce_rate', value: 0.35 },
              { name: 'conversion_rate', value: 0.12 }
            ]
          }
        },
        executedAt: new Date().toISOString(),
        duration: 300
      };
      
      const contextWithComplexData = {
        ...mockContext,
        previousResults: new Map([['complex-source', complexSourceResult]])
      };
      
      const paramsWithComplexData = {
        template: 'Complex data template',
        sources: ['complex-source'],
        format: 'json',
        title: 'Complex Data Report'
      } as OutputNodeParameters;
      
      const handlerWithComplexData = new OutputHandler(paramsWithComplexData, 'complex-data-node');
      
      const result = await handlerWithComplexData.execute(contextWithComplexData);
      
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.sourceData['complex-source']).toEqual(complexSourceResult.data);
    });

    it('should set execution timestamp', async () => {
      const beforeExecution = Date.now();
      const result = await handler.execute(mockContext);
      const afterExecution = Date.now();
      
      const executedAtTimestamp = new Date(result.executedAt).getTime();
      expect(executedAtTimestamp).toBeGreaterThanOrEqual(beforeExecution);
      expect(executedAtTimestamp).toBeLessThanOrEqual(afterExecution);
    });

    it('should work with empty context', async () => {
      const emptyContext = {
        ...global.createMockContext(),
        previousResults: new Map()
      };
      
      const result = await handler.execute(emptyContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('output-node');
      const data = result.data as any;
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
        format: 'text'
      } as OutputNodeParameters;
      
      const minimalHandler = new OutputHandler(minimalParams, 'minimal-output-node');
      const result = minimalHandler.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when template is missing', () => {
      const paramsWithoutTemplate = {
        sources: ['source1'],
        format: 'text'
      } as OutputNodeParameters;
      
      const handlerWithoutTemplate = new OutputHandler(paramsWithoutTemplate, 'no-template-node');
      const result = handlerWithoutTemplate.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Template is required',
        nodeId: 'no-template-node',
        severity: 'error'
      });
    });

    it('should fail validation when template is empty string', () => {
      const paramsWithEmptyTemplate = {
        template: '',
        sources: ['source1'],
        format: 'text'
      } as OutputNodeParameters;
      
      const handlerWithEmptyTemplate = new OutputHandler(paramsWithEmptyTemplate, 'empty-template-node');
      const result = handlerWithEmptyTemplate.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('Template is required');
    });

    it('should fail validation when sources are missing', () => {
      const paramsWithoutSources = {
        template: 'Some template',
        format: 'text'
      } as OutputNodeParameters;
      
      const handlerWithoutSources = new OutputHandler(paramsWithoutSources, 'no-sources-node');
      const result = handlerWithoutSources.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one source node is required',
        nodeId: 'no-sources-node',
        severity: 'error'
      });
    });

    it('should fail validation when sources array is empty', () => {
      const paramsWithEmptySources = {
        template: 'Some template',
        sources: [],
        format: 'text'
      } as OutputNodeParameters;
      
      const handlerWithEmptySources = new OutputHandler(paramsWithEmptySources, 'empty-sources-validation-node');
      const result = handlerWithEmptySources.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('At least one source node is required');
    });

    it('should fail validation for both missing template and sources', () => {
      const paramsWithMissingFields = {
        format: 'text',
        title: 'Some title'
      } as OutputNodeParameters;
      
      const handlerWithMissingFields = new OutputHandler(paramsWithMissingFields, 'missing-fields-node');
      const result = handlerWithMissingFields.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      
      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toEqual(['MISSING_REQUIRED_FIELD', 'MISSING_REQUIRED_FIELD']);
      
      const errorMessages = result.errors.map(e => e.message);
      expect(errorMessages).toContain('Template is required');
      expect(errorMessages).toContain('At least one source node is required');
    });

    it('should validate with different output formats', () => {
      const formats: Array<OutputNodeParameters['format']> = [
        'text', 'markdown', 'json', 'html', 'xml', 'pdf', 'csv'
      ];
      
      for (const format of formats) {
        const paramsWithFormat = {
          ...mockNode.parameters,
          format
        } as OutputNodeParameters;
        
        const handlerWithFormat = new OutputHandler(paramsWithFormat, `format-validation-${format}-node`);
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