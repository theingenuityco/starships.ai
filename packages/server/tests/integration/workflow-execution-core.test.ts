/**
 * Core Workflow Execution Tests
 * 
 * Focused tests for the workflow execution engine without complex dependencies.
 * Tests the core functionality of workflow DSL execution.
 */

import { 
  WorkflowDSL,
  WorkflowDSLNode,
  WorkflowDSLEdge,
  WorkflowExecutionContext,
  AgentNodeParameters,
  ConditionalNodeParameters,
  UserPromptNodeParameters
} from '@starships/protocol';
import { 
  WorkflowExecutionService,
  workflowNodeRegistry,
  AgentNodeHandler,
  ConditionalNodeHandler,
  UserPromptNodeHandler
} from '../../src/services';
import { v4 as uuidv4 } from 'uuid';

// Mock agent service for testing
const mockAgentService = {
  getAgent: jest.fn().mockResolvedValue({
    id: 'test-agent',
    name: 'Test Agent',
    description: 'Test agent for workflow testing'
  })
};

describe('Workflow Execution Core Tests', () => {
  let workflowExecutionService: WorkflowExecutionService;

  beforeAll(() => {
    workflowExecutionService = WorkflowExecutionService.getInstance();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should execute simple linear workflow', async () => {
    const workflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        {
          id: 'start-1',
          type: 'start',
          name: 'Start Process',
          description: 'Begin workflow execution',
          parameters: {}
        },
        {
          id: 'end-1',
          type: 'end', 
          name: 'Complete Process',
          description: 'End workflow execution',
          parameters: {}
        }
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'end-1' }
      ],
      visualization: '',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString()
    };

    const context: Partial<WorkflowExecutionContext> = {
      expeditionId: workflow.expeditionId,
      userId: 'test-user'
    };

    const result = await workflowExecutionService.executeWorkflow(workflow, context);
    
    expect(result.status).toBe('completed');
    expect(result.executionResults.size).toBe(0); // Only start/end nodes, which don't produce results
  });

  test('should handle workflow validation errors', async () => {
    const workflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        // Missing start node
        {
          id: 'end-1',
          type: 'end',
          name: 'Complete Process',
          description: 'End workflow execution',
          parameters: {}
        }
      ],
      edges: [],
      visualization: '',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString()
    };

    await expect(
      workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      })
    ).rejects.toThrow(/start node/);
  });

  test('should track execution state correctly', async () => {
    const workflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        {
          id: 'start-1',
          type: 'start',
          name: 'Start',
          description: 'Start workflow',
          parameters: {}
        },
        {
          id: 'end-1',
          type: 'end',
          name: 'End',
          description: 'End workflow',
          parameters: {}
        }
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'end-1' }
      ],
      visualization: '',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString()
    };

    const result = await workflowExecutionService.executeWorkflow(workflow, {
      expeditionId: workflow.expeditionId,
      userId: 'test-user'
    });

    expect(result.id).toBeDefined();
    expect(result.workflowId).toBe(workflow.id);
    expect(result.status).toBe('completed');
    expect(result.startTime).toBeDefined();
    expect(result.endTime).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  test('should handle execution events', async () => {
    const events: any[] = [];
    
    workflowExecutionService.onEvent(async (event) => {
      events.push(event);
    });

    const workflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        {
          id: 'start-1',
          type: 'start',
          name: 'Start',
          description: 'Start workflow',
          parameters: {}
        },
        {
          id: 'end-1',
          type: 'end',
          name: 'End',
          description: 'End workflow',
          parameters: {}
        }
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'end-1' }
      ],
      visualization: '',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString()
    };

    await workflowExecutionService.executeWorkflow(workflow, {
      expeditionId: workflow.expeditionId,
      userId: 'test-user'
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'workflow_started')).toBe(true);
    expect(events.some(e => e.type === 'workflow_completed')).toBe(true);
  });

  test('should handle workflow with unsupported node types', async () => {
    const workflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        {
          id: 'start-1',
          type: 'start',
          name: 'Start',
          description: 'Start workflow',
          parameters: {}
        },
        {
          id: 'unsupported-1',
          type: 'unsupported_type' as any,
          name: 'Unsupported Node',
          description: 'Node type that doesnt exist',
          parameters: {}
        }
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'unsupported-1' }
      ],
      visualization: '',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString()
    };

    await expect(
      workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'test-user'
      })
    ).rejects.toThrow(/Unsupported node types/);
  });
});

describe('Workflow Node Registry Tests', () => {
  test('should have all required handlers registered', () => {
    const stats = workflowNodeRegistry.getStats();
    expect(stats.totalHandlers).toBeGreaterThan(0);
    
    const supportedTypes = stats.supportedTypes;
    expect(supportedTypes).toContain('agent');
    expect(supportedTypes).toContain('conditional'); 
    expect(supportedTypes).toContain('user_prompt');
  });

  test('should get correct handler for node types', () => {
    const agentHandler = workflowNodeRegistry.getHandler('agent');
    expect(agentHandler).toBeDefined();
    expect(agentHandler?.type).toBe('agent');

    const conditionalHandler = workflowNodeRegistry.getHandler('conditional');
    expect(conditionalHandler).toBeDefined();
    expect(conditionalHandler?.type).toBe('conditional');

    const userPromptHandler = workflowNodeRegistry.getHandler('user_prompt');
    expect(userPromptHandler).toBeDefined();
    expect(userPromptHandler?.type).toBe('user_prompt');
  });

  test('should return null for unknown handler types', () => {
    const unknownHandler = workflowNodeRegistry.getHandler('unknown_type');
    expect(unknownHandler).toBeNull();
  });

  test('should validate required handlers', () => {
    const validation = workflowNodeRegistry.validateRequiredHandlers(['agent', 'conditional']);
    expect(validation.valid).toBe(true);
    expect(validation.missing).toHaveLength(0);

    const invalidValidation = workflowNodeRegistry.validateRequiredHandlers(['non_existent']);
    expect(invalidValidation.valid).toBe(false);
    expect(invalidValidation.missing).toContain('non_existent');
  });
});

describe('Individual Node Handler Tests', () => {
  describe('AgentNodeHandler', () => {
    test('should validate agent node parameters correctly', () => {
      const agentHandler = workflowNodeRegistry.getHandler('agent') as AgentNodeHandler;
      expect(agentHandler).toBeDefined();

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

      const result = agentHandler.validate(validNode);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject agent node with missing parameters', () => {
      const agentHandler = workflowNodeRegistry.getHandler('agent') as AgentNodeHandler;
      
      const invalidNode: WorkflowDSLNode = {
        id: 'test-agent',
        type: 'agent',
        name: 'Test Agent',
        description: 'Test agent node',
        parameters: {} // Missing required parameters
      };

      const result = agentHandler.validate(invalidNode);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('ConditionalNodeHandler', () => {
    test('should validate conditional node parameters correctly', () => {
      const conditionalHandler = workflowNodeRegistry.getHandler('conditional') as ConditionalNodeHandler;
      expect(conditionalHandler).toBeDefined();

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

      const result = conditionalHandler.validate(validNode);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject conditional node with invalid JSONata expression', () => {
      const conditionalHandler = workflowNodeRegistry.getHandler('conditional') as ConditionalNodeHandler;
      
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

      const result = conditionalHandler.validate(invalidNode);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_JSONATA_EXPRESSION')).toBe(true);
    });
  });

  describe('UserPromptNodeHandler', () => {
    test('should validate user prompt node parameters correctly', () => {
      const userPromptHandler = workflowNodeRegistry.getHandler('user_prompt') as UserPromptNodeHandler;
      expect(userPromptHandler).toBeDefined();

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

      const result = userPromptHandler.validate(validNode);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject user prompt node with duplicate choice IDs', () => {
      const userPromptHandler = workflowNodeRegistry.getHandler('user_prompt') as UserPromptNodeHandler;
      
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

      const result = userPromptHandler.validate(invalidNode);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate choice ID'))).toBe(true);
    });
  });
});

afterAll(() => {
  console.log('Workflow execution core tests completed');
});