/**
 * AgentHandler Unit Tests
 */

import { AgentHandler } from '../AgentHandler';
import { Node, ExecutionContext, AgentNodeParameters } from '../../../types';

describe('AgentHandler', () => {
  let handler: AgentHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    handler = new AgentHandler();
    mockNode = {
      id: 'agent-node',
      type: 'agent',
      name: 'Test Agent Node',
      description: 'Agent node for testing',
      parameters: {
        name: 'Customer Support Agent',
        description: 'Helps customers with inquiries',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a helpful customer support agent.',
        temperature: 0.7,
        maxTokens: 500,
        instructions: 'Test instructions for the agent',
        timeout: 5000
      } as AgentNodeParameters
    };
    mockContext = global.createMockContext();
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('agent');
    });
  });

  describe('execute', () => {
    it('should execute successfully with valid parameters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await handler.execute(mockNode, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('agent-node');
      expect(result.data).toEqual({ 
        output: 'Agent execution completed',
        agentName: 'Customer Support Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a helpful customer support agent.'
      });
      expect(result.duration).toBe(5000); // Uses timeout value
      expect(result.executedAt).toBeDefined();
      expect(result.error).toBeUndefined();
      
      // Verify console.log was called with correct parameters
      expect(consoleSpy).toHaveBeenCalledWith(
        'Executing agent: Customer Support Agent (model: anthropic/claude-3.5-sonnet) with instructions: Test instructions for the agent'
      );
      
      consoleSpy.mockRestore();
    });

    it('should execute successfully with minimal parameters', async () => {
      const minimalNode = {
        ...mockNode,
        parameters: {
          name: 'Basic Agent',
          model: 'openai/gpt-4'
        } as AgentNodeParameters
      };
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await handler.execute(minimalNode, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('agent-node');
      expect(result.data).toEqual({ 
        output: 'Agent execution completed',
        agentName: 'Basic Agent',
        model: 'openai/gpt-4',
        systemPrompt: undefined
      });
      
      // Verify console.log handles undefined instructions
      expect(consoleSpy).toHaveBeenCalledWith(
        'Executing agent: Basic Agent (model: openai/gpt-4) with instructions: undefined'
      );
      
      consoleSpy.mockRestore();
    });

    it('should set execution timestamp', async () => {
      const beforeExecution = Date.now();
      const result = await handler.execute(mockNode, mockContext);
      const afterExecution = Date.now();
      
      const executedAtTimestamp = new Date(result.executedAt).getTime();
      expect(executedAtTimestamp).toBeGreaterThanOrEqual(beforeExecution);
      expect(executedAtTimestamp).toBeLessThanOrEqual(afterExecution);
    });

    it('should work with empty context', async () => {
      const emptyContext = {} as ExecutionContext;
      
      const result = await handler.execute(mockNode, emptyContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('agent-node');
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const result = handler.validate(mockNode);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should validate successfully with minimal valid parameters', () => {
      const minimalNode = {
        ...mockNode,
        parameters: {
          name: 'Test Agent',
          model: 'openai/gpt-4'
        } as AgentNodeParameters
      };
      
      const result = handler.validate(minimalNode);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should fail validation when name is missing', () => {
      const nodeWithoutName = {
        ...mockNode,
        parameters: {
          model: 'openai/gpt-4',
          instructions: 'Some instructions'
        } as AgentNodeParameters
      };
      
      const result = handler.validate(nodeWithoutName);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent name is required',
        nodeId: 'agent-node',
        severity: 'error'
      });
      expect(result.warnings).toHaveLength(0);
    });

    it('should fail validation when model is missing', () => {
      const nodeWithoutModel = {
        ...mockNode,
        parameters: {
          name: 'Test Agent',
          instructions: 'Some instructions'
        } as AgentNodeParameters
      };
      
      const result = handler.validate(nodeWithoutModel);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent model is required',
        nodeId: 'agent-node',
        severity: 'error'
      });
    });

    it('should fail validation when both name and model are missing', () => {
      const nodeWithoutRequiredParams = {
        ...mockNode,
        parameters: {
          instructions: 'Some instructions'
        } as AgentNodeParameters
      };
      
      const result = handler.validate(nodeWithoutRequiredParams);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[1].code).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should fail validation when parameters are completely missing', () => {
      const nodeWithoutParams = {
        ...mockNode,
        parameters: {} as AgentNodeParameters
      };
      
      const result = handler.validate(nodeWithoutParams);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[1].code).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should handle empty string values as invalid', () => {
      const nodeWithEmptyValues = {
        ...mockNode,
        parameters: {
          name: '',
          model: '',
          instructions: 'Some instructions'
        } as AgentNodeParameters
      };
      
      const result = handler.validate(nodeWithEmptyValues);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('robot');
    });
  });
});