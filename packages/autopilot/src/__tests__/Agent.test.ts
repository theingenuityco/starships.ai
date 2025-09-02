/**
 * Agent Unit Tests
 */

import { Agent } from '../Agent';
import { Engine } from '../engine/Engine';
import { AgentMemory, AgentMemoryState } from '../AgentMemory';
import { AgentNodeParameters, Blueprint, Execution } from '../types';

// Mock the Engine
jest.mock('../engine/Engine');
const MockedEngine = Engine as jest.MockedClass<typeof Engine>;

describe('Agent', () => {
  let agent: Agent;
  let basicParams: AgentNodeParameters;
  let mockEngine: jest.Mocked<Engine>;

  beforeEach(() => {
    // Reset mocks
    MockedEngine.mockClear();
    
    // Create mock engine instance
    mockEngine = {
      execute: jest.fn(),
      hasHandler: jest.fn()
    } as unknown;
    
    // Make constructor return our mock
    MockedEngine.mockImplementation(() => mockEngine);
    
    // Setup default hasHandler behavior
    mockEngine.hasHandler.mockImplementation((nodeType: string) => {
      const supportedTypes = ['start', 'end', 'agent', 'llm', 'conditional', 'output', 'prompt', 'workflow', 'http-request'];
      return supportedTypes.includes(nodeType);
    });

    // Basic valid parameters
    basicParams = {
      name: 'TestAgent',
      model: 'gpt-4',
      memory: {
        identity: { name: 'TestBot' },
        purpose: { primary: 'Help users' }
      },
      blueprint: {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'end' }
        ],
        metadata: {}
      }
    };

    agent = new Agent(basicParams);
  });

  describe('constructor', () => {
    it('should initialize with valid parameters', () => {
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.getName()).toBe('TestAgent');
      expect(agent.getModel()).toBe('gpt-4');
    });

    it('should create AgentMemory instance from memory state', () => {
      expect(agent.getMemory()).toBeInstanceOf(AgentMemory);
      expect(agent.getMemory().getIdentity()).toEqual({ name: 'TestBot' });
      expect(agent.getMemory().getPurpose()).toEqual({ primary: 'Help users' });
    });

    it('should create deep copy of blueprint to prevent mutations', () => {
      const originalBlueprint = basicParams.blueprint;
      
      // Mutate original blueprint
      originalBlueprint.nodes[0].name = 'Modified Start';
      originalBlueprint.edges[0].condition = 'modified';
      originalBlueprint.metadata = { modified: true };
      
      // Agent should have original values
      const agentBlueprint = agent.getBlueprint();
      expect(agentBlueprint.nodes[0].name).toBe('Start');
      expect(agentBlueprint.edges[0]).not.toHaveProperty('condition');
      expect(agentBlueprint.metadata).toEqual({});
    });

    it('should create Engine instance', () => {
      expect(MockedEngine).toHaveBeenCalledTimes(1);
    });

    it('should handle minimal parameters', () => {
      const minimalParams: AgentNodeParameters = {
        name: 'MinimalAgent',
        model: 'gpt-3.5-turbo',
        memory: {},
        blueprint: {
          nodes: [
            { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} }
          ],
          edges: [],
          metadata: {}
        }
      };

      const minimalAgent = new Agent(minimalParams);
      
      expect(minimalAgent.getName()).toBe('MinimalAgent');
      expect(minimalAgent.getDescription()).toBeUndefined();
      expect(minimalAgent.getTimeout()).toBeUndefined();
    });

    it('should handle empty memory state', () => {
      const paramsWithEmptyMemory: AgentNodeParameters = {
        ...basicParams,
        memory: {}
      };

      const agentWithEmptyMemory = new Agent(paramsWithEmptyMemory);
      const memory = agentWithEmptyMemory.getMemory();
      
      expect(memory.getIdentity()).toBeUndefined();
      expect(memory.getPurpose()).toBeUndefined();
      expect(memory.getSpace()).toBeUndefined();
    });
  });

  describe('getter methods', () => {
    beforeEach(() => {
      const fullParams: AgentNodeParameters = {
        name: 'FullAgent',
        description: 'A comprehensive test agent',
        model: 'gpt-4-turbo',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000,
        memory: {
          identity: { name: 'FullBot', role: 'Assistant' },
          purpose: { primary: 'Complete testing', secondary: ['Quality assurance'] },
          space: { description: 'Test environment' }
        },
        blueprint: {
          nodes: [
            { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
            { ref: 'process', type: 'agent', name: 'Process', description: 'Process node', parameters: {} },
            { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
          ],
          edges: [
            { ref: 'edge-1', from: 'start', to: 'process' },
            { ref: 'edge-2', from: 'process', to: 'end' }
          ],
          metadata: { version: '1.0', author: 'test' }
        }
      };

      agent = new Agent(fullParams);
    });

    it('should get agent name', () => {
      expect(agent.getName()).toBe('FullAgent');
    });

    it('should get agent description', () => {
      expect(agent.getDescription()).toBe('A comprehensive test agent');
    });

    it('should get agent model', () => {
      expect(agent.getModel()).toBe('gpt-4-turbo');
    });

    it('should get agent timeout', () => {
      expect(agent.getTimeout()).toBe(30000);
    });

    it('should get agent memory instance', () => {
      const memory = agent.getMemory();
      expect(memory).toBeInstanceOf(AgentMemory);
      expect(memory.getIdentity()).toEqual({ name: 'FullBot', role: 'Assistant' });
      expect(memory.getPurpose()).toEqual({ primary: 'Complete testing', secondary: ['Quality assurance'] });
      expect(memory.getSpace()).toEqual({ description: 'Test environment' });
    });

    it('should get parameters as deep copy', () => {
      const params = agent.getParameters();
      
      expect(params.name).toBe('FullAgent');
      expect(params.model).toBe('gpt-4-turbo');
      expect(params.temperature).toBe(0.7);
      expect(params.maxTokens).toBe(1000);
      expect(params.timeout).toBe(30000);
      
      // Modify returned params should not affect original
      params.name = 'Modified';
      params.blueprint.nodes[0].name = 'Modified Start';
      
      expect(agent.getName()).toBe('FullAgent');
      expect(agent.getBlueprint().nodes[0].name).toBe('Start');
    });

    it('should get blueprint as deep copy', () => {
      const blueprint = agent.getBlueprint();
      
      expect(blueprint.nodes).toHaveLength(3);
      expect(blueprint.edges).toHaveLength(2);
      expect(blueprint.metadata).toEqual({ version: '1.0', author: 'test' });
      
      // Modify returned blueprint should not affect original
      blueprint.nodes[0].name = 'Modified Start';
      blueprint.metadata!.modified = true;
      
      expect(agent.getBlueprint().nodes[0].name).toBe('Start');
      expect(agent.getBlueprint().metadata).toEqual({ version: '1.0', author: 'test' });
    });

    it('should get nodes as copy', () => {
      const nodes = agent.getNodes();
      
      expect(nodes).toHaveLength(3);
      expect(nodes[0].ref).toBe('start');
      expect(nodes[1].ref).toBe('process');
      expect(nodes[2].ref).toBe('end');
      
      // Modify returned nodes should not affect original
      nodes[0].name = 'Modified Start';
      
      expect(agent.getBlueprint().nodes[0].name).toBe('Start');
    });

    it('should get edges as copy', () => {
      const edges = agent.getEdges();
      
      expect(edges).toHaveLength(2);
      expect(edges[0].from).toBe('start');
      expect(edges[0].to).toBe('process');
      
      // Modify returned edges should not affect original
      edges[0].condition = 'modified';
      
      expect(agent.getBlueprint().edges[0]).not.toHaveProperty('condition');
    });
  });

  describe('addToMemory', () => {
    it('should add user message to memory', () => {
      agent.addToMemory('user', 'Hello agent');
      
      const memory = agent.getMemory();
      const messages = memory.getMessageHistory();
      
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello agent');
    });

    it('should add assistant message to memory', () => {
      agent.addToMemory('assistant', 'Hello user');
      
      const memory = agent.getMemory();
      const messages = memory.getMessageHistory();
      
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('Hello user');
    });

    it('should add message with metadata', () => {
      const metadata = { source: 'test', priority: 'high' };
      agent.addToMemory('user', 'Test message', metadata);
      
      const memory = agent.getMemory();
      const messages = memory.getMessageHistory();
      
      expect(messages[0].metadata).toEqual(metadata);
    });

    it('should add multiple messages in order', () => {
      agent.addToMemory('user', 'First message');
      agent.addToMemory('assistant', 'Second message');
      agent.addToMemory('user', 'Third message');
      
      const messages = agent.getMemory().getMessageHistory();
      
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('Second message');
      expect(messages[2].content).toBe('Third message');
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      mockEngine.execute.mockResolvedValue({
        status: 'completed',
        executionResults: new Map(),
        agentMemory: agent.getMemory()
      } as Execution);
    });

    it('should execute using engine with blueprint', async () => {
      await agent.execute();
      
      expect(mockEngine.execute).toHaveBeenCalledTimes(1);
      expect(mockEngine.execute).toHaveBeenCalledWith(
        basicParams.blueprint,
        expect.objectContaining({
          currentNodeRef: undefined,
          status: 'not_started',
          executionResults: expect.any(Map),
          agentMemory: expect.any(AgentMemory)
        })
      );
    });

    it('should merge with initial execution if provided', async () => {
      const initialExecution: Partial<Execution> = {
        currentNodeRef: 'start',
        status: 'running',
        executionResults: new Map([['test', { nodeRef: 'test', data: 'test-data' }]])
      };

      await agent.execute(initialExecution as Execution);
      
      expect(mockEngine.execute).toHaveBeenCalledWith(
        basicParams.blueprint,
        expect.objectContaining({
          currentNodeRef: 'start',
          status: 'running',
          executionResults: expect.any(Map),
          agentMemory: expect.any(AgentMemory)
        })
      );
      
      const executionArg = mockEngine.execute.mock.calls[0][1]!;
      expect(executionArg.executionResults.get('test')).toEqual({ nodeRef: 'test', data: 'test-data' });
    });

    it('should always include agent memory in execution', async () => {
      agent.addToMemory('user', 'Test message');
      
      await agent.execute();
      
      const executionArg = mockEngine.execute.mock.calls[0][1]!;
      expect(executionArg.agentMemory).toBe(agent.getMemory());
      expect(executionArg.agentMemory.getMessageHistory()).toHaveLength(1);
    });

    it('should return execution result from engine', async () => {
      const mockResult: Execution = {
        status: 'completed',
        executionResults: new Map([['result', { nodeRef: 'result', data: 'final-result' }]]),
        agentMemory: agent.getMemory()
      };
      
      mockEngine.execute.mockResolvedValue(mockResult);
      
      const result = await agent.execute();
      
      expect(result).toBe(mockResult);
    });

    it('should handle engine execution errors', async () => {
      const executionError = new Error('Engine execution failed');
      mockEngine.execute.mockRejectedValue(executionError);
      
      await expect(agent.execute()).rejects.toThrow('Engine execution failed');
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid agent', () => {
      const result = agent.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when name is missing', () => {
      const invalidParams = { ...basicParams };
      delete (invalidParams as any).name;
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent name is required');
    });

    it('should fail validation when model is missing', () => {
      const invalidParams = { ...basicParams };
      delete (invalidParams as any).model;
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent model is required');
    });

    it('should fail validation when memory is missing', () => {
      const invalidParams = { ...basicParams };
      delete (invalidParams as any).memory;
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent memory is required');
    });

    it('should fail validation when blueprint is missing', () => {
      const invalidParams = { ...basicParams };
      delete (invalidParams as any).blueprint;
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent blueprint is required');
    });

    it('should fail validation when start node is missing from blueprint', () => {
      const invalidParams: AgentNodeParameters = {
        ...basicParams,
        blueprint: {
          nodes: [
            { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
          ],
          edges: [],
          metadata: {}
        }
      };
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent blueprint must have a start node');
    });

    it('should fail validation with unsupported node types', () => {
      mockEngine.hasHandler.mockReturnValue(false); // Make engine reject all node types
      
      const result = agent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => 
        error.includes('Unsupported node types in agent blueprint')
      )).toBe(true);
    });

    it('should fail validation with invalid edge references', () => {
      const invalidParams: AgentNodeParameters = {
        ...basicParams,
        blueprint: {
          nodes: [
            { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
            { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
          ],
          edges: [
            { ref: 'edge-1', from: 'start', to: 'nonexistent' }, // Invalid 'to' reference
            { ref: 'edge-2', from: 'missing', to: 'end' } // Invalid 'from' reference
          ],
          metadata: {}
        }
      };
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => 
        error.includes('Invalid edge references found in agent blueprint: 2 edges')
      )).toBe(true);
    });

    it('should fail validation with invalid timeout', () => {
      const invalidParams: AgentNodeParameters = {
        ...basicParams,
        timeout: 500 // Less than 1000ms
      };
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent timeout should be at least 1000ms');
    });

    it('should fail validation with invalid temperature', () => {
      const invalidParams: AgentNodeParameters = {
        ...basicParams,
        temperature: 3.0 // Greater than 2
      };
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent temperature should be between 0 and 2');
    });

    it('should fail validation with negative temperature', () => {
      const invalidParams: AgentNodeParameters = {
        ...basicParams,
        temperature: -0.5
      };
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent temperature should be between 0 and 2');
    });

    it('should fail validation with invalid maxTokens', () => {
      const invalidParams: AgentNodeParameters = {
        ...basicParams,
        maxTokens: 0 // Less than 1
      };
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent maxTokens should be at least 1');
    });

    it('should pass validation with all valid optional parameters', () => {
      const validParams: AgentNodeParameters = {
        ...basicParams,
        description: 'Valid test agent',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000
      };
      const validAgent = new Agent(validParams);
      
      const result = validAgent.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accumulate multiple validation errors', () => {
      const invalidParams = {
        name: '', // Empty name
        model: '', // Empty model
        temperature: 5, // Invalid temperature
        maxTokens: -1, // Invalid maxTokens
        timeout: 100, // Invalid timeout
        memory: {}, // Valid but minimal memory
        blueprint: {
          nodes: [], // No start node
          edges: [
            { ref: 'invalid', from: 'missing1', to: 'missing2' } // Invalid edge references
          ],
          metadata: {}
        }
      } as AgentNodeParameters;
      
      const invalidAgent = new Agent(invalidParams);
      
      const result = invalidAgent.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(5); // Multiple errors
    });
  });

  describe('clone', () => {
    beforeEach(() => {
      // Setup agent with full data for thorough cloning test
      agent.addToMemory('user', 'System prompt');
      agent.addToMemory('user', 'User message');
    });

    it('should create a new Agent instance', () => {
      const cloned = agent.clone();
      
      expect(cloned).toBeInstanceOf(Agent);
      expect(cloned).not.toBe(agent);
    });

    it('should copy all agent parameters', () => {
      const cloned = agent.clone();
      
      expect(cloned.getName()).toBe(agent.getName());
      expect(cloned.getModel()).toBe(agent.getModel());
      expect(cloned.getDescription()).toBe(agent.getDescription());
      expect(cloned.getTimeout()).toBe(agent.getTimeout());
    });

    it('should copy blueprint structure', () => {
      const cloned = agent.clone();
      const originalBlueprint = agent.getBlueprint();
      const clonedBlueprint = cloned.getBlueprint();
      
      expect(clonedBlueprint).toEqual(originalBlueprint);
      expect(clonedBlueprint).not.toBe(originalBlueprint);
      expect(clonedBlueprint.nodes).not.toBe(originalBlueprint.nodes);
      expect(clonedBlueprint.edges).not.toBe(originalBlueprint.edges);
    });

    it('should copy memory state including messages', () => {
      const cloned = agent.clone();
      const originalMemory = agent.getMemory();
      const clonedMemory = cloned.getMemory();
      
      expect(clonedMemory).not.toBe(originalMemory);
      expect(clonedMemory.getIdentity()).toEqual(originalMemory.getIdentity());
      expect(clonedMemory.getPurpose()).toEqual(originalMemory.getPurpose());
      expect(clonedMemory.getMessageHistory()).toHaveLength(2);
      expect(clonedMemory.getMessageHistory()[0].content).toBe('System prompt');
      expect(clonedMemory.getMessageHistory()[1].content).toBe('User message');
    });

    it('should maintain independence between original and clone', () => {
      const cloned = agent.clone();
      
      // Modify original agent memory
      agent.addToMemory('user', 'New message in original');
      
      // Clone should not be affected
      expect(agent.getMemory().getMessageHistory()).toHaveLength(3);
      expect(cloned.getMemory().getMessageHistory()).toHaveLength(2);
      
      // Modify clone memory
      cloned.addToMemory('assistant', 'New message in clone');
      
      // Original should not be affected
      expect(agent.getMemory().getMessageHistory()).toHaveLength(3);
      expect(cloned.getMemory().getMessageHistory()).toHaveLength(3);
    });

    it('should create new Engine instance for clone', () => {
      const initialEngineCallCount = MockedEngine.mock.calls.length;
      
      agent.clone();
      
      expect(MockedEngine.mock.calls.length).toBe(initialEngineCallCount + 1);
    });

    it('should handle empty memory state in clone', () => {
      const emptyMemoryParams: AgentNodeParameters = {
        ...basicParams,
        memory: {}
      };
      const emptyAgent = new Agent(emptyMemoryParams);
      
      const cloned = emptyAgent.clone();
      
      expect(cloned.getMemory().getIdentity()).toBeUndefined();
      expect(cloned.getMemory().getPurpose()).toBeUndefined();
      expect(cloned.getMemory().getSpace()).toBeUndefined();
    });
  });

  describe('updateParameters', () => {
    beforeEach(() => {
      agent.addToMemory('user', 'Original message');
    });

    it('should create new Agent with updated parameters', () => {
      const updates: Partial<AgentNodeParameters> = {
        name: 'UpdatedAgent',
        model: 'gpt-4-turbo'
      };
      
      const updated = agent.updateParameters(updates);
      
      expect(updated).toBeInstanceOf(Agent);
      expect(updated).not.toBe(agent);
      expect(updated.getName()).toBe('UpdatedAgent');
      expect(updated.getModel()).toBe('gpt-4-turbo');
    });

    it('should preserve existing parameters when not updated', () => {
      const updates: Partial<AgentNodeParameters> = {
        temperature: 0.8
      };
      
      const updated = agent.updateParameters(updates);
      
      expect(updated.getName()).toBe(agent.getName());
      expect(updated.getModel()).toBe(agent.getModel());
      expect(updated.getParameters().temperature).toBe(0.8);
    });

    it('should preserve current memory state when not updating memory', () => {
      const updates: Partial<AgentNodeParameters> = {
        timeout: 45000
      };
      
      const updated = agent.updateParameters(updates);
      const updatedMemory = updated.getMemory();
      const originalMemory = agent.getMemory();
      
      expect(updatedMemory.getIdentity()).toEqual(originalMemory.getIdentity());
      expect(updatedMemory.getPurpose()).toEqual(originalMemory.getPurpose());
      expect(updatedMemory.getMessageHistory()).toHaveLength(1);
      expect(updatedMemory.getMessageHistory()[0].content).toBe('Original message');
    });

    it('should use provided memory state when updating memory', () => {
      const newMemoryState: AgentMemoryState = {
        identity: { name: 'NewBot', role: 'Updated' },
        purpose: { primary: 'New purpose' },
        space: { description: 'New space' }
      };
      
      const updates: Partial<AgentNodeParameters> = {
        memory: newMemoryState
      };
      
      const updated = agent.updateParameters(updates);
      const updatedMemory = updated.getMemory();
      
      expect(updatedMemory.getIdentity()).toEqual({ name: 'NewBot', role: 'Updated' });
      expect(updatedMemory.getPurpose()).toEqual({ primary: 'New purpose' });
      expect(updatedMemory.getSpace()).toEqual({ description: 'New space' });
    });

    it('should preserve blueprint when not updating', () => {
      const updates: Partial<AgentNodeParameters> = {
        name: 'UpdatedAgent'
      };
      
      const updated = agent.updateParameters(updates);
      
      expect(updated.getBlueprint()).toEqual(agent.getBlueprint());
      expect(updated.getBlueprint()).not.toBe(agent.getBlueprint());
    });

    it('should use provided blueprint when updating', () => {
      const newBlueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'New Start', description: 'New start node', parameters: {} },
          { ref: 'middle', type: 'agent', name: 'Middle', description: 'Middle node', parameters: {} },
          { ref: 'end', type: 'end', name: 'New End', description: 'New end node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'middle' },
          { ref: 'edge-2', from: 'middle', to: 'end' }
        ],
        metadata: { version: '2.0' }
      };
      
      const updates: Partial<AgentNodeParameters> = {
        blueprint: newBlueprint
      };
      
      const updated = agent.updateParameters(updates);
      
      expect(updated.getBlueprint()).toEqual(newBlueprint);
      expect(updated.getNodes()).toHaveLength(3);
      expect(updated.getEdges()).toHaveLength(2);
    });

    it('should not mutate original agent', () => {
      const originalName = agent.getName();
      const originalBlueprint = agent.getBlueprint();
      
      const updates: Partial<AgentNodeParameters> = {
        name: 'ModifiedAgent',
        blueprint: {
          nodes: [
            { ref: 'modified', type: 'start', name: 'Modified', description: 'Modified node', parameters: {} }
          ],
          edges: [],
          metadata: { modified: true }
        }
      };
      
      agent.updateParameters(updates);
      
      expect(agent.getName()).toBe(originalName);
      expect(agent.getBlueprint()).toEqual(originalBlueprint);
    });

    it('should create new Engine instance for updated agent', () => {
      const initialEngineCallCount = MockedEngine.mock.calls.length;
      
      agent.updateParameters({ name: 'UpdatedAgent' });
      
      expect(MockedEngine.mock.calls.length).toBe(initialEngineCallCount + 1);
    });

    it('should handle multiple parameter updates', () => {
      const updates: Partial<AgentNodeParameters> = {
        name: 'MultiUpdateAgent',
        description: 'Multi-updated agent',
        model: 'gpt-4-turbo',
        temperature: 0.5,
        maxTokens: 2000,
        timeout: 60000
      };
      
      const updated = agent.updateParameters(updates);
      
      expect(updated.getName()).toBe('MultiUpdateAgent');
      expect(updated.getDescription()).toBe('Multi-updated agent');
      expect(updated.getModel()).toBe('gpt-4-turbo');
      
      const params = updated.getParameters();
      expect(params.temperature).toBe(0.5);
      expect(params.maxTokens).toBe(2000);
      expect(params.timeout).toBe(60000);
    });

    it('should handle empty updates', () => {
      const updated = agent.updateParameters({});
      
      expect(updated.getName()).toBe(agent.getName());
      expect(updated.getModel()).toBe(agent.getModel());
      expect(updated.getBlueprint()).toEqual(agent.getBlueprint());
      expect(updated.getMemory().getMessageHistory()).toEqual(agent.getMemory().getMessageHistory());
    });
  });

  describe('edge cases', () => {
    it('should handle agent with complex blueprint', () => {
      const complexBlueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          { ref: 'decision', type: 'conditional', name: 'Decision', description: 'Decision node', parameters: {} },
          { ref: 'agent1', type: 'agent', name: 'Agent 1', description: 'First agent', parameters: {} },
          { ref: 'agent2', type: 'agent', name: 'Agent 2', description: 'Second agent', parameters: {} },
          { ref: 'http', type: 'http_request', name: 'HTTP Call', description: 'HTTP request', parameters: {} },
          { ref: 'output', type: 'output', name: 'Output', description: 'Output node', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'decision' },
          { ref: 'edge-2', from: 'decision', to: 'agent1', condition: 'path1' },
          { ref: 'edge-3', from: 'decision', to: 'agent2', condition: 'path2' },
          { ref: 'edge-4', from: 'agent1', to: 'http' },
          { ref: 'edge-5', from: 'agent2', to: 'http' },
          { ref: 'edge-6', from: 'http', to: 'output' },
          { ref: 'edge-7', from: 'output', to: 'end' }
        ],
        metadata: { 
          version: '1.2', 
          complexity: 'high',
          tags: ['multi-agent', 'conditional', 'http']
        }
      };

      const complexParams: AgentNodeParameters = {
        ...basicParams,
        blueprint: complexBlueprint
      };

      const complexAgent = new Agent(complexParams);
      
      expect(complexAgent.getNodes()).toHaveLength(7);
      expect(complexAgent.getEdges()).toHaveLength(7);
      expect(complexAgent.validate().valid).toBe(true);
    });

    it('should handle agent with rich memory state', () => {
      const richMemoryState: AgentMemoryState = {
        identity: {
          name: 'RichBot',
          role: 'Senior Assistant',
          personality: 'Professional, detail-oriented, and helpful',
          expertise: ['data analysis', 'report generation', 'API integration', 'workflow automation']
        },
        purpose: {
          primary: 'Automate complex business workflows',
          secondary: [
            'Generate comprehensive reports',
            'Integrate with external systems',
            'Provide data insights'
          ],
          constraints: [
            'Must maintain data privacy',
            'Follow security protocols',
            'Provide audit trails'
          ]
        },
        space: {
          description: 'A modern office environment with access to various business systems and databases'
        },
        messages: [
          { id: '1', timestamp: '2023-01-01T00:00:00Z', role: 'system', content: 'Initial system setup' },
          { id: '2', timestamp: '2023-01-01T00:01:00Z', role: 'user', content: 'Start workflow analysis' },
          { id: '3', timestamp: '2023-01-01T00:02:00Z', role: 'assistant', content: 'Beginning analysis...' }
        ]
      };

      const richParams: AgentNodeParameters = {
        ...basicParams,
        memory: richMemoryState
      };

      const richAgent = new Agent(richParams);
      const memory = richAgent.getMemory();
      
      expect(memory.getIdentity()?.expertise).toHaveLength(4);
      expect(memory.getPurpose()?.secondary).toHaveLength(3);
      expect(memory.getPurpose()?.constraints).toHaveLength(3);
      expect(memory.getMessageHistory()).toHaveLength(3);
    });

    it('should handle extreme parameter values within valid ranges', () => {
      const extremeParams: AgentNodeParameters = {
        ...basicParams,
        temperature: 0.0, // Minimum valid temperature
        maxTokens: 1, // Minimum valid maxTokens
        timeout: 1000 // Minimum valid timeout
      };

      const extremeAgent = new Agent(extremeParams);
      const validation = extremeAgent.validate();
      
      expect(validation.valid).toBe(true);
      expect(extremeAgent.getParameters().temperature).toBe(0.0);
      expect(extremeAgent.getParameters().maxTokens).toBe(1);
      expect(extremeAgent.getParameters().timeout).toBe(1000);
    });

    it('should handle agent with no edges in blueprint', () => {
      const noEdgesBlueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Isolated start node', parameters: {} }
        ],
        edges: [],
        metadata: {}
      };

      const noEdgesParams: AgentNodeParameters = {
        ...basicParams,
        blueprint: noEdgesBlueprint
      };

      const noEdgesAgent = new Agent(noEdgesParams);
      
      expect(noEdgesAgent.getNodes()).toHaveLength(1);
      expect(noEdgesAgent.getEdges()).toHaveLength(0);
      // Validation might fail due to no path to completion, but agent should be created
      expect(noEdgesAgent).toBeInstanceOf(Agent);
    });
  });
});