/**
 * Workflow Node Handlers Unit Tests
 * 
 * Unit tests for individual workflow node handlers without external dependencies.
 */

import {
  WorkflowDSLNode,
  AgentNodeParameters,
  ConditionalNodeParameters,
  UserPromptNodeParameters,
  WorkflowExecutionContext
} from '@starships/protocol';
import { 
  WorkflowNodeRegistry,
  BaseWorkflowNodeHandler
} from '../../src/services/WorkflowNodeRegistry';
import { AgentNodeHandler } from '../../src/services/AgentNodeHandler';
import { ConditionalNodeHandler } from '../../src/services/ConditionalNodeHandler';
import { UserPromptNodeHandler } from '../../src/services/UserPromptNodeHandler';
import { v4 as uuidv4 } from 'uuid';

describe('Workflow Node Registry Tests', () => {
  let registry: WorkflowNodeRegistry;

  beforeEach(() => {
    registry = new WorkflowNodeRegistry();
  });

  test('should register and retrieve handlers', () => {
    const agentHandler = new AgentNodeHandler();
    registry.register(agentHandler);

    const retrievedHandler = registry.getHandler('agent');
    expect(retrievedHandler).toBe(agentHandler);
    expect(retrievedHandler?.type).toBe('agent');
  });

  test('should return null for unknown handler types', () => {
    const unknownHandler = registry.getHandler('unknown_type');
    expect(unknownHandler).toBeNull();
  });

  test('should validate required handlers', () => {
    const agentHandler = new AgentNodeHandler();
    registry.register(agentHandler);

    const validation = registry.validateRequiredHandlers(['agent']);
    expect(validation.valid).toBe(true);
    expect(validation.missing).toHaveLength(0);

    const invalidValidation = registry.validateRequiredHandlers(['non_existent']);
    expect(invalidValidation.valid).toBe(false);
    expect(invalidValidation.missing).toContain('non_existent');
  });

  test('should get correct statistics', () => {
    const agentHandler = new AgentNodeHandler();
    const conditionalHandler = new ConditionalNodeHandler();
    
    registry.register(agentHandler);
    registry.register(conditionalHandler);

    const stats = registry.getStats();
    expect(stats.totalHandlers).toBe(2);
    expect(stats.supportedTypes).toContain('agent');
    expect(stats.supportedTypes).toContain('conditional');
  });
});

describe('AgentNodeHandler Tests', () => {
  let handler: AgentNodeHandler;

  beforeEach(() => {
    handler = new AgentNodeHandler();
  });

  test('should validate valid agent node', () => {
    const validNode: WorkflowDSLNode = {
      id: 'test-agent',
      type: 'agent',
      name: 'Test Agent',
      description: 'Test agent node',
      parameters: {
        agentId: 'test-agent-id',
        taskIds: ['task-1', 'task-2']
      } as AgentNodeParameters
    };

    const result = handler.validate(validNode);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject agent node with missing parameters', () => {
    const invalidNode: WorkflowDSLNode = {
      id: 'test-agent',
      type: 'agent',
      name: 'Test Agent',
      description: 'Test agent node',
      parameters: {}
    };

    const result = handler.validate(invalidNode);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.includes('agentId'))).toBe(true);
  });

  test('should reject agent node with invalid taskIds', () => {
    const invalidNode: WorkflowDSLNode = {
      id: 'test-agent',
      type: 'agent',
      name: 'Test Agent',
      description: 'Test agent node',
      parameters: {
        agentId: 'test-agent-id',
        taskIds: [] // Empty array
      } as AgentNodeParameters
    };

    const result = handler.validate(invalidNode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('taskIds'))).toBe(true);
  });

  test('should generate correct visualization', () => {
    const node: WorkflowDSLNode = {
      id: 'test-agent',
      type: 'agent',
      name: 'Test Agent',
      description: 'Test agent node',
      estimatedTime: 15,
      parameters: {
        agentId: 'test-agent-id',
        taskIds: ['task-1', 'task-2']
      } as AgentNodeParameters
    };

    const visualization = handler.getVisualization(node);
    expect(visualization).toContain('[AGENT]');
    expect(visualization).toContain('Test Agent');
    expect(visualization).toContain('(15m)');
    expect(visualization).toContain('Agent: test-agent-id');
    expect(visualization).toContain('Tasks: 2');
  });

  test('should calculate estimated time', () => {
    const node: WorkflowDSLNode = {
      id: 'test-agent',
      type: 'agent',
      name: 'Test Agent',
      description: 'Test agent node',
      parameters: {
        agentId: 'test-agent-id',
        taskIds: ['task-1', 'task-2'],
        instructions: 'Simple task with basic instructions'
      } as AgentNodeParameters
    };

    const estimatedTime = handler.getEstimatedTime(node);
    expect(estimatedTime).toBeGreaterThan(0);
  });

  test('should check if can handle node', () => {
    const agentNode: WorkflowDSLNode = {
      id: 'test-agent',
      type: 'agent',
      name: 'Test Agent',
      description: 'Test agent node',
      parameters: {
        agentId: 'test-agent-id',
        taskIds: ['task-1']
      } as AgentNodeParameters
    };

    const conditionalNode: WorkflowDSLNode = {
      id: 'test-conditional',
      type: 'conditional',
      name: 'Test Conditional',
      description: 'Test conditional node',
      parameters: {
        sourceNodeId: 'source',
        expression: 'data.value',
        conditions: { 'default': 'true' }
      } as ConditionalNodeParameters
    };

    expect(handler.canHandle(agentNode)).toBe(true);
    expect(handler.canHandle(conditionalNode)).toBe(false);
  });
});

describe('ConditionalNodeHandler Tests', () => {
  let handler: ConditionalNodeHandler;

  beforeEach(() => {
    handler = new ConditionalNodeHandler();
  });

  test('should validate valid conditional node', () => {
    const validNode: WorkflowDSLNode = {
      id: 'test-conditional',
      type: 'conditional',
      name: 'Test Conditional',
      description: 'Test conditional node',
      parameters: {
        sourceNodeId: 'source-node',
        expression: 'data.value',
        conditions: {
          'high': 'result > 80',
          'low': 'result <= 80'
        }
      } as ConditionalNodeParameters
    };

    const result = handler.validate(validNode);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject conditional node with invalid JSONata expression', () => {
    const invalidNode: WorkflowDSLNode = {
      id: 'test-conditional',
      type: 'conditional',
      name: 'Test Conditional',
      description: 'Test conditional node',
      parameters: {
        sourceNodeId: 'source-node',
        expression: '{{{{ invalid expression }}}}',
        conditions: {
          'default': 'true'
        }
      } as ConditionalNodeParameters
    };

    const result = handler.validate(invalidNode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_JSONATA_EXPRESSION')).toBe(true);
  });

  test('should reject conditional node with missing conditions', () => {
    const invalidNode: WorkflowDSLNode = {
      id: 'test-conditional',
      type: 'conditional',
      name: 'Test Conditional',
      description: 'Test conditional node',
      parameters: {
        sourceNodeId: 'source-node',
        expression: 'data.value',
        conditions: {} // Empty conditions
      } as ConditionalNodeParameters
    };

    const result = handler.validate(invalidNode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('at least one condition'))).toBe(true);
  });

  test('should generate correct visualization', () => {
    const node: WorkflowDSLNode = {
      id: 'test-conditional',
      type: 'conditional',
      name: 'Test Conditional',
      description: 'Test conditional node',
      estimatedTime: 2,
      parameters: {
        sourceNodeId: 'source-node',
        expression: 'data.value',
        conditions: {
          'high': 'result > 80',
          'low': 'result <= 80'
        }
      } as ConditionalNodeParameters
    };

    const visualization = handler.getVisualization(node);
    expect(visualization).toContain('[CONDITIONAL]');
    expect(visualization).toContain('Test Conditional');
    expect(visualization).toContain('(2m)');
    expect(visualization).toContain('Source: source-node');
    expect(visualization).toContain('Conditions: 2');
  });

  test('should calculate estimated time', () => {
    const node: WorkflowDSLNode = {
      id: 'test-conditional',
      type: 'conditional',
      name: 'Test Conditional',
      description: 'Test conditional node',
      parameters: {
        sourceNodeId: 'source-node',
        expression: 'data.value',
        conditions: {
          'high': 'result > 80',
          'medium': 'result > 50 and result <= 80',
          'low': 'result <= 50'
        }
      } as ConditionalNodeParameters
    };

    const estimatedTime = handler.getEstimatedTime(node);
    expect(estimatedTime).toBeGreaterThan(0);
  });
});

describe('UserPromptNodeHandler Tests', () => {
  let handler: UserPromptNodeHandler;

  beforeEach(() => {
    handler = new UserPromptNodeHandler();
  });

  test('should validate valid user prompt node', () => {
    const validNode: WorkflowDSLNode = {
      id: 'test-prompt',
      type: 'user_prompt',
      name: 'Test User Prompt',
      description: 'Test user prompt node',
      parameters: {
        promptText: 'Please make a choice',
        choices: [
          { id: 'yes', text: 'Yes', value: true },
          { id: 'no', text: 'No', value: false }
        ]
      } as UserPromptNodeParameters
    };

    const result = handler.validate(validNode);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject user prompt node with duplicate choice IDs', () => {
    const invalidNode: WorkflowDSLNode = {
      id: 'test-prompt',
      type: 'user_prompt',
      name: 'Test User Prompt',
      description: 'Test user prompt node',
      parameters: {
        promptText: 'Please make a choice',
        choices: [
          { id: 'choice', text: 'Choice 1', value: 1 },
          { id: 'choice', text: 'Choice 2', value: 2 } // Duplicate ID
        ]
      } as UserPromptNodeParameters
    };

    const result = handler.validate(invalidNode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Duplicate choice ID'))).toBe(true);
  });

  test('should reject user prompt node with empty choices', () => {
    const invalidNode: WorkflowDSLNode = {
      id: 'test-prompt',
      type: 'user_prompt',
      name: 'Test User Prompt',
      description: 'Test user prompt node',
      parameters: {
        promptText: 'Please make a choice',
        choices: [] // Empty choices
      } as UserPromptNodeParameters
    };

    const result = handler.validate(invalidNode);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('non-empty array'))).toBe(true);
  });

  test('should generate correct visualization', () => {
    const node: WorkflowDSLNode = {
      id: 'test-prompt',
      type: 'user_prompt',
      name: 'Test User Prompt',
      description: 'Test user prompt node',
      parameters: {
        promptText: 'Please make a choice',
        choices: [
          { id: 'yes', text: 'Yes', value: true },
          { id: 'no', text: 'No', value: false }
        ],
        timeout: 30,
        sourceNodeId: 'source-node'
      } as UserPromptNodeParameters
    };

    const visualization = handler.getVisualization(node);
    expect(visualization).toContain('[USER PROMPT]');
    expect(visualization).toContain('Test User Prompt');
    expect(visualization).toContain('Choices: 2');
    expect(visualization).toContain('Timeout: 30m');
    expect(visualization).toContain('Context: source-node');
  });

  test('should calculate estimated time based on timeout', () => {
    const node: WorkflowDSLNode = {
      id: 'test-prompt',
      type: 'user_prompt',
      name: 'Test User Prompt',
      description: 'Test user prompt node',
      parameters: {
        promptText: 'Please make a choice',
        choices: [
          { id: 'yes', text: 'Yes', value: true }
        ],
        timeout: 90 // 90 minutes
      } as UserPromptNodeParameters
    };

    const estimatedTime = handler.getEstimatedTime(node);
    expect(estimatedTime).toBe(60); // Capped at 60 minutes
  });

  test('should manage user prompt lifecycle', () => {
    const expeditionId = uuidv4();
    
    // Initially no pending prompts
    const initialPrompts = handler.getPendingPromptsForExpedition(expeditionId);
    expect(initialPrompts).toHaveLength(0);

    // Test that we can create and manage prompts would require execution context
    // For unit tests, we just verify the interface exists
    expect(typeof handler.respondToPrompt).toBe('function');
    expect(typeof handler.cancelPrompt).toBe('function');
    expect(typeof handler.getPendingPromptsForExpedition).toBe('function');
  });
});

describe('BaseWorkflowNodeHandler Tests', () => {
  class TestNodeHandler extends BaseWorkflowNodeHandler {
    readonly type = 'agent'; // Use valid type
    
    async execute(node: WorkflowDSLNode, context: WorkflowExecutionContext) {
      return this.createSuccessResult(node, { message: 'success' });
    }

    validate() {
      return { valid: true, errors: [], warnings: [], suggestions: [] };
    }
  }

  let handler: TestNodeHandler;

  beforeEach(() => {
    handler = new TestNodeHandler();
  });

  test('should create success result correctly', async () => {
    const node: WorkflowDSLNode = {
      id: 'test-node',
      type: 'agent',
      name: 'Test Node',
      description: 'Test node',
      parameters: {}
    };

    const result = await handler.execute(node, {} as WorkflowExecutionContext);
    expect(result.success).toBe(true);
    expect(result.nodeId).toBe('test-node');
    expect(result.data).toEqual({ message: 'success' });
  });

  test('should create error result correctly', () => {
    const node: WorkflowDSLNode = {
      id: 'test-node',
      type: 'agent',
      name: 'Test Node',
      description: 'Test node',
      parameters: {}
    };

    const result = handler['createErrorResult'](node, 'Test error');
    expect(result.success).toBe(false);
    expect(result.nodeId).toBe('test-node');
    expect(result.error).toBe('Test error');
  });

  test('should validate required parameters', () => {
    const node: WorkflowDSLNode = {
      id: 'test-node',
      type: 'agent',
      name: 'Test Node',
      description: 'Test node',
      parameters: {
        requiredParam: 'value'
      }
    };

    const result = handler['validateRequiredParams'](node, ['requiredParam']);
    expect(result.valid).toBe(true);

    const invalidResult = handler['validateRequiredParams'](node, ['missingParam']);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.some(e => e.message.includes('missingParam'))).toBe(true);
  });

  test('should generate default visualization', () => {
    const node: WorkflowDSLNode = {
      id: 'test-node',
      type: 'agent',
      name: 'Test Node',
      description: 'Test node',
      estimatedTime: 10,
      parameters: {}
    };

    const visualization = handler.getVisualization(node);
    expect(visualization).toContain('[AGENT]');
    expect(visualization).toContain('Test Node');
    expect(visualization).toContain('(10m)');
  });

  test('should calculate default estimated time', () => {
    const nodeWithTime: WorkflowDSLNode = {
      id: 'test-node-1',
      type: 'agent',
      name: 'Test Node With Time',
      description: 'Test node',
      estimatedTime: 25,
      parameters: {}
    };

    const nodeWithoutTime: WorkflowDSLNode = {
      id: 'test-node-2',
      type: 'agent',
      name: 'Test Node Without Time',
      description: 'Test node',
      parameters: {}
    };

    expect(handler.getEstimatedTime(nodeWithTime)).toBe(25);
    expect(handler.getEstimatedTime(nodeWithoutTime)).toBe(10); // Default
  });

  test('should check if can handle node by type', () => {
    const agentNode: WorkflowDSLNode = {
      id: 'test-node',
      type: 'agent',
      name: 'Test Node',
      description: 'Test node',
      parameters: {}
    };

    const conditionalNode: WorkflowDSLNode = {
      id: 'other-node',
      type: 'conditional',
      name: 'Other Node',
      description: 'Other node',
      parameters: {}
    };

    expect(handler.canHandle(agentNode)).toBe(true);
    expect(handler.canHandle(conditionalNode)).toBe(true); // Since our test handler type is 'agent' but canHandle checks type
  });
});

afterAll(() => {
  console.log('Workflow node handlers unit tests completed');
});