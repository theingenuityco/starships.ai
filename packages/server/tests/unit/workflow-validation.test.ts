/**
 * Workflow DSL Validation Tests
 * 
 * Direct tests for workflow DSL validation and core functionality without external dependencies.
 */

import { WorkflowGenerationService } from '../../src/services/WorkflowGenerationService';
import {
  WorkflowGenerationRequest,
  WorkflowDSL,
  AgentAssignment,
  WorkflowComplexity
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

describe('Workflow Generation Service Tests', () => {
  let workflowGenerationService: WorkflowGenerationService;

  beforeEach(() => {
    workflowGenerationService = new WorkflowGenerationService();
  });

  test('should generate simple workflow from basic request', async () => {
    const request: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Create a simple data processing workflow',
      taskBreakdown: [
        {
          id: 'task-1',
          title: 'Extract Data',
          description: 'Extract data from source system',
          estimatedTime: 10
        },
        {
          id: 'task-2', 
          title: 'Process Data',
          description: 'Transform and clean the extracted data',
          estimatedTime: 15
        }
      ],
      selectedAgents: [
        {
          agentId: 'agent-1',
          agentName: 'Data Extractor',
          skills: ['data_extraction', 'api_integration'],
          availability: 'available',
          assignedTasks: []
        },
        {
          agentId: 'agent-2',
          agentName: 'Data Processor', 
          skills: ['data_transformation', 'cleaning'],
          availability: 'available',
          assignedTasks: []
        }
      ],
      complexity: 'simple'
    };

    const result = await workflowGenerationService.generateWorkflow(request);

    expect(result).toBeDefined();
    expect(result.workflow).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.metadata).toBeDefined();
    
    const workflow = result.workflow;
    expect(workflow.id).toBeDefined();
    expect(workflow.expeditionId).toBe(request.expeditionId);
    expect(workflow.nodes.length).toBeGreaterThan(2);
    expect(workflow.edges.length).toBeGreaterThan(0);
    expect(workflow.approvalStatus).toBe('pending');
  });

  test('should generate workflow with start and end nodes', async () => {
    const request: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Test workflow structure',
      taskBreakdown: [
        {
          id: 'task-1',
          title: 'Test Task',
          description: 'A simple test task'
        }
      ],
      selectedAgents: [
        {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          skills: ['testing'],
          availability: 'available',
          assignedTasks: []
        }
      ]
    };

    const result = await workflowGenerationService.generateWorkflow(request);
    const workflow = result.workflow;

    const startNodes = workflow.nodes.filter(n => n.type === 'start');
    const endNodes = workflow.nodes.filter(n => n.type === 'end');

    expect(startNodes).toHaveLength(1);
    expect(endNodes).toHaveLength(1);
    expect(startNodes[0].name).toContain('Start');
    expect(endNodes[0].name).toContain('Complete');
  });

  test('should create agent nodes for each task', async () => {
    const request: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Multi-task workflow',
      taskBreakdown: [
        { id: 'task-1', title: 'Task 1', description: 'First task' },
        { id: 'task-2', title: 'Task 2', description: 'Second task' },
        { id: 'task-3', title: 'Task 3', description: 'Third task' }
      ],
      selectedAgents: [
        {
          agentId: 'agent-1',
          agentName: 'Multi Agent',
          skills: ['general'],
          availability: 'available',
          assignedTasks: []
        }
      ]
    };

    const result = await workflowGenerationService.generateWorkflow(request);
    const workflow = result.workflow;

    const agentNodes = workflow.nodes.filter(n => n.type === 'agent');
    expect(agentNodes).toHaveLength(3);
    
    agentNodes.forEach(node => {
      expect(node.parameters.agentId).toBeDefined();
      expect(node.parameters.taskIds).toBeDefined();
      expect(Array.isArray(node.parameters.taskIds)).toBe(true);
    });
  });

  test('should add user approval for moderate complexity', async () => {
    const request: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Moderate complexity workflow',
      taskBreakdown: [
        { id: 'task-1', title: 'Task 1', description: 'Complex task' }
      ],
      selectedAgents: [
        {
          agentId: 'agent-1',
          agentName: 'Agent',
          skills: ['general'],
          availability: 'available',
          assignedTasks: []
        }
      ],
      complexity: 'moderate'
    };

    const result = await workflowGenerationService.generateWorkflow(request);
    const workflow = result.workflow;

    const userPromptNodes = workflow.nodes.filter(n => n.type === 'user_prompt');
    expect(userPromptNodes.length).toBeGreaterThan(0);
    
    const userPromptNode = userPromptNodes[0];
    expect(userPromptNode.parameters.promptText).toBeDefined();
    expect(userPromptNode.parameters.choices).toBeDefined();
    expect(Array.isArray(userPromptNode.parameters.choices)).toBe(true);
  });

  test('should validate workflow structure', async () => {
    const request: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Test validation',
      taskBreakdown: [
        { id: 'task-1', title: 'Task', description: 'Test task' }
      ],
      selectedAgents: [
        {
          agentId: 'agent-1',
          agentName: 'Agent',
          skills: ['general'],
          availability: 'available',
          assignedTasks: []
        }
      ]
    };

    const result = await workflowGenerationService.generateWorkflow(request);
    const validation = await workflowGenerationService.validateWorkflow(result.workflow);

    expect(validation).toBeDefined();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should reject validation for workflow without start node', async () => {
    const invalidWorkflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        {
          id: 'end-1',
          type: 'end',
          name: 'End',
          description: 'End without start',
          parameters: {}
        }
      ],
      edges: [],
      visualization: '',
      approvalStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    const validation = await workflowGenerationService.validateWorkflow(invalidWorkflow);
    
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors.some(e => e.code === 'MISSING_START_NODE')).toBe(true);
  });

  test('should detect duplicate node IDs', async () => {
    const invalidWorkflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        {
          id: 'duplicate-id',
          type: 'start',
          name: 'Start',
          description: 'Start node',
          parameters: {}
        },
        {
          id: 'duplicate-id', // Same ID
          type: 'end',
          name: 'End',
          description: 'End node',
          parameters: {}
        }
      ],
      edges: [],
      visualization: '',
      approvalStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    const validation = await workflowGenerationService.validateWorkflow(invalidWorkflow);
    
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.code === 'DUPLICATE_NODE_ID')).toBe(true);
  });

  test('should generate ASCII visualization', async () => {
    const request: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Visualization test',
      taskBreakdown: [
        { id: 'task-1', title: 'Task', description: 'Test task' }
      ],
      selectedAgents: [
        {
          agentId: 'agent-1',
          agentName: 'Agent',
          skills: ['general'],
          availability: 'available',
          assignedTasks: []
        }
      ]
    };

    const result = await workflowGenerationService.generateWorkflow(request);
    const workflow = result.workflow;

    expect(workflow.visualization).toBeDefined();
    expect(workflow.visualization.length).toBeGreaterThan(0);
    expect(workflow.visualization).toContain('[START]');
    expect(workflow.visualization).toContain('[AGENT]');
    expect(workflow.visualization).toContain('[END]');
  });

  test('should handle empty task breakdown', async () => {
    const request: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Empty task test',
      taskBreakdown: [], // Empty
      selectedAgents: []
    };

    const result = await workflowGenerationService.generateWorkflow(request);
    
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(result.warnings?.some(w => w.includes('No tasks defined'))).toBe(true);
  });

  test('should handle no assigned agents', async () => {
    const request: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'No agents test',
      taskBreakdown: [
        { id: 'task-1', title: 'Task', description: 'Test task' }
      ],
      selectedAgents: [] // No agents
    };

    const result = await workflowGenerationService.generateWorkflow(request);
    
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(result.warnings?.some(w => w.includes('No agents assigned'))).toBe(true);
  });

  test('should calculate confidence based on input quality', async () => {
    const goodRequest: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Well-defined workflow',
      taskBreakdown: [
        { id: 'task-1', title: 'Task 1', description: 'Detailed task description' },
        { id: 'task-2', title: 'Task 2', description: 'Another detailed task' }
      ],
      selectedAgents: [
        {
          agentId: 'agent-1',
          agentName: 'Specialized Agent',
          skills: ['specific_skill'],
          availability: 'available',
          assignedTasks: []
        },
        {
          agentId: 'agent-2',
          agentName: 'Another Agent',
          skills: ['another_skill'],
          availability: 'available',
          assignedTasks: []
        }
      ],
      complexity: 'simple'
    };

    const poorRequest: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Vague objective',
      taskBreakdown: [],
      selectedAgents: [],
      complexity: 'advanced'
    };

    const goodResult = await workflowGenerationService.generateWorkflow(goodRequest);
    const poorResult = await workflowGenerationService.generateWorkflow(poorRequest);

    expect(goodResult.confidence).toBeGreaterThan(poorResult.confidence);
  });
});

describe('Workflow Generation Edge Cases', () => {
  let workflowGenerationService: WorkflowGenerationService;

  beforeEach(() => {
    workflowGenerationService = new WorkflowGenerationService();
  });

  test('should handle missing expedition ID', async () => {
    const invalidRequest: any = {
      objective: 'Test objective',
      taskBreakdown: [],
      selectedAgents: []
      // Missing expeditionId
    };

    await expect(
      workflowGenerationService.generateWorkflow(invalidRequest)
    ).rejects.toThrow('Expedition ID is required');
  });

  test('should handle missing objective', async () => {
    const invalidRequest: any = {
      expeditionId: uuidv4(),
      taskBreakdown: [],
      selectedAgents: []
      // Missing objective
    };

    await expect(
      workflowGenerationService.generateWorkflow(invalidRequest)
    ).rejects.toThrow('Objective is required');
  });

  test('should generate suggestions for complex workflows', async () => {
    const complexRequest: WorkflowGenerationRequest = {
      expeditionId: uuidv4(),
      objective: 'Complex workflow with many tasks',
      taskBreakdown: Array.from({ length: 8 }, (_, i) => ({
        id: `task-${i + 1}`,
        title: `Task ${i + 1}`,
        description: `Complex task ${i + 1}`
      })),
      selectedAgents: [
        {
          agentId: 'agent-1',
          agentName: 'Overloaded Agent',
          skills: ['general'],
          availability: 'available',
          assignedTasks: []
        }
      ]
    };

    const result = await workflowGenerationService.generateWorkflow(complexRequest);
    
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });
});

afterAll(() => {
  console.log('Workflow validation tests completed');
});