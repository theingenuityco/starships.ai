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
        agentId: 'test-agent-123',
        instructions: 'Test instructions for the agent',
        taskIds: ['task-1', 'task-2'],
        expectedOutput: 'Expected test output',
        timeout: 5000,
        estimatedTime: 2000
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
      expect(result.data).toEqual({ output: 'Agent execution completed' });
      expect(result.duration).toBe(1000);
      expect(result.executedAt).toBeDefined();
      expect(result.error).toBeUndefined();
      
      // Verify console.log was called with correct parameters
      expect(consoleSpy).toHaveBeenCalledWith(
        'Executing agent: test-agent-123 with instructions: Test instructions for the agent'
      );
      
      consoleSpy.mockRestore();
    });

    it('should execute successfully with minimal parameters', async () => {
      const minimalNode = {
        ...mockNode,
        parameters: {
          agentId: 'minimal-agent'
        } as AgentNodeParameters
      };
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await handler.execute(minimalNode, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('agent-node');
      expect(result.data).toEqual({ output: 'Agent execution completed' });
      
      // Verify console.log handles undefined instructions
      expect(consoleSpy).toHaveBeenCalledWith(
        'Executing agent: minimal-agent with instructions: undefined'
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
          agentId: 'test-agent'
        } as AgentNodeParameters
      };
      
      const result = handler.validate(minimalNode);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when agentId is missing', () => {
      const nodeWithoutAgentId = {
        ...mockNode,
        parameters: {
          instructions: 'Some instructions'
        } as AgentNodeParameters
      };
      
      const result = handler.validate(nodeWithoutAgentId);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent ID is required',
        nodeId: 'agent-node',
        severity: 'error'
      });
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should fail validation when agentId is empty string', () => {
      const nodeWithEmptyAgentId = {
        ...mockNode,
        parameters: {
          agentId: '',
          instructions: 'Some instructions'
        } as AgentNodeParameters
      };
      
      const result = handler.validate(nodeWithEmptyAgentId);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('Agent ID is required');
    });

    it('should fail validation when parameters are completely missing', () => {
      const nodeWithoutParams = {
        ...mockNode,
        parameters: {} as AgentNodeParameters
      };
      
      const result = handler.validate(nodeWithoutParams);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('robot');
    });
  });
});