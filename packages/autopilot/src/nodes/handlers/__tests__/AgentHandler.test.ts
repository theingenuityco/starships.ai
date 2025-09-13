/**
 * AgentHandler Unit Tests
 */

import { AgentHandler } from '@/nodes/handlers/AgentHandler';
import { Node, Execution, AgentParams } from '@/types';
import { AgentMemoryState } from '@/AgentMemory';

interface AgentExecutionResult {
  agentName: string;
  model: string;
  systemPrompt?: string;
  instructions?: string;
  workflowId: string;
  workflowResults: unknown[];
  workflowStatus: string;
  output: string;
}

describe('AgentHandler', () => {
  let handler: AgentHandler;
  let mockNode: Node;
  let mockExecution: Execution;

  beforeEach(() => {
    mockNode = {
      ref: 'agent-node',
      type: 'agent',
      name: 'Test Agent Node',
      description: 'Agent node for testing',
      parameters: {
        name: 'Customer Support Agent',
        description: 'Helps customers with inquiries',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {
          identity: {
            name: 'Customer Support Agent',
            role: 'customer support representative',
            personality: 'helpful and friendly',
          },
          purpose: {
            primary: 'Help customers with their inquiries',
          },
        } as AgentMemoryState,
        temperature: 0.7,
        maxTokens: 500,
        timeout: 5000,
        blueprint: global.createMockBlueprint(),
      } as AgentParams,
    };
    handler = new AgentHandler(mockNode);
    mockExecution = global.createMockExecution();
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('agent');
    });
  });

  describe('execute', () => {
    it('should execute successfully with valid parameters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await handler.execute(mockExecution);

      const nodeResult = result.results.get('agent-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('agent-node');
      expect(nodeResult?.data).toEqual(
        expect.objectContaining({
          agentName: 'Customer Support Agent',
          model: 'anthropic/claude-3.5-sonnet',
          workflowResults: expect.any(Array),
          workflowStatus: 'completed',
          output: 'Agent Customer Support Agent completed workflow execution successfully',
        })
      );
      const agentResult = nodeResult?.data as AgentExecutionResult;
      expect(agentResult.workflowResults).toBeDefined();
      expect(Array.isArray(agentResult.workflowResults)).toBe(true);

      // Verify console.log was called with correct parameters
      expect(consoleSpy).toHaveBeenCalledWith(
        'Executing agent: Customer Support Agent (model: anthropic/claude-3.5-sonnet) with workflow execution'
      );

      consoleSpy.mockRestore();
    });

    it('should execute successfully with minimal parameters', async () => {
      const minimalParams = {
        name: 'Basic Agent',
        model: 'openai/gpt-4',
        memoryState: {} as AgentMemoryState,
        blueprint: global.createMockBlueprint(),
      } as AgentParams;

      const minimalNode: Node = {
        ref: 'minimal-agent-node',
        type: 'agent',
        name: 'Minimal Agent',
        description: 'Minimal agent for testing',
        parameters: minimalParams,
      };
      const minimalHandler = new AgentHandler(minimalNode);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await minimalHandler.execute(mockExecution);

      const nodeResult = result.results.get('minimal-agent-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('minimal-agent-node');
      expect(nodeResult?.data).toEqual(
        expect.objectContaining({
          agentName: 'Basic Agent',
          model: 'openai/gpt-4',
          workflowResults: expect.any(Array),
          workflowStatus: 'completed',
          output: 'Agent Basic Agent completed workflow execution successfully',
        })
      );
      const agentResult = nodeResult?.data as AgentExecutionResult;
      expect(agentResult.workflowResults).toBeDefined();
      expect(Array.isArray(agentResult.workflowResults)).toBe(true);

      // Verify console.log was called correctly
      expect(consoleSpy).toHaveBeenCalledWith('Executing agent: Basic Agent (model: openai/gpt-4) with workflow execution');

      consoleSpy.mockRestore();
    });

    it('should set execution timestamp', async () => {
      const result = await handler.execute(mockExecution);

      expect(result).toBeDefined();
      const nodeResult = result.results.get('agent-node');
      expect(nodeResult).toBeDefined();
    });

    it('should work with empty execution', async () => {
      const emptyExecution = global.createMockExecution();

      const result = await handler.execute(emptyExecution);

      const nodeResult = result.results.get('agent-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('agent-node');
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
        name: 'Test Agent',
        model: 'openai/gpt-4',
        memoryState: {} as AgentMemoryState,
        blueprint: global.createMockBlueprint(),
      } as AgentParams;

      const minimalNode: Node = {
        ref: 'minimal-agent-node',
        type: 'agent',
        name: 'Minimal Agent',
        description: 'Minimal agent for testing',
        parameters: minimalParams,
      };
      const minimalHandler = new AgentHandler(minimalNode);
      const result = minimalHandler.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should fail validation when name is missing', () => {
      const paramsWithoutName = {
        model: 'openai/gpt-4',
        memory: {} as AgentMemoryState,
        blueprint: global.createMockBlueprint(),
      } as unknown as AgentParams;

      const nodeWithoutName: Node = {
        ref: 'no-name-agent-node',
        type: 'agent',
        name: 'Agent without name',
        description: 'Agent without name for testing',
        parameters: paramsWithoutName,
      };
      const handlerWithoutName = new AgentHandler(nodeWithoutName);
      const result = handlerWithoutName.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent name is required',
        nodeRef: 'no-name-agent-node',
        severity: 'error',
      });
      expect(result.warnings).toHaveLength(0);
    });

    it('should fail validation when model is missing', () => {
      const paramsWithoutModel = {
        name: 'Test Agent',
        memory: {} as AgentMemoryState,
        blueprint: global.createMockBlueprint(),
      } as unknown as AgentParams;

      const nodeWithoutModel: Node = {
        ref: 'no-model-agent-node',
        type: 'agent',
        name: 'Agent without model',
        description: 'Agent without model for testing',
        parameters: paramsWithoutModel,
      };
      const handlerWithoutModel = new AgentHandler(nodeWithoutModel);
      const result = handlerWithoutModel.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent model is required',
        nodeRef: 'no-model-agent-node',
        severity: 'error',
      });
    });

    it('should fail validation when both name and model are missing', () => {
      const paramsWithoutRequiredParams = {
        memory: {} as AgentMemoryState,
        blueprint: global.createMockBlueprint(),
      } as unknown as AgentParams;

      const nodeWithoutRequiredParams: Node = {
        ref: 'no-required-agent-node',
        type: 'agent',
        name: 'Agent without required params',
        description: 'Agent without required params for testing',
        parameters: paramsWithoutRequiredParams,
      };
      const handlerWithoutRequiredParams = new AgentHandler(nodeWithoutRequiredParams);
      const result = handlerWithoutRequiredParams.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[1].code).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should fail validation when parameters are completely missing', () => {
      const emptyParams = {} as AgentParams;

      const nodeWithoutParams: Node = {
        ref: 'empty-params-agent-node',
        type: 'agent',
        name: 'Agent with empty params',
        description: 'Agent with empty params for testing',
        parameters: emptyParams,
      };
      const handlerWithoutParams = new AgentHandler(nodeWithoutParams);
      const result = handlerWithoutParams.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4); // name, model, memory, blueprint
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[1].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[2].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[3].code).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should handle empty string values as invalid', () => {
      const paramsWithEmptyValues = {
        name: '',
        model: '',
        memoryState: {} as AgentMemoryState,
        blueprint: global.createMockBlueprint(),
      } as AgentParams;

      const nodeWithEmptyValues: Node = {
        ref: 'empty-values-agent-node',
        type: 'agent',
        name: 'Agent with empty values',
        description: 'Agent with empty values for testing',
        parameters: paramsWithEmptyValues,
      };
      const handlerWithEmptyValues = new AgentHandler(nodeWithEmptyValues);
      const result = handlerWithEmptyValues.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2); // empty name and model
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('robot');
    });
  });
});
