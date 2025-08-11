/**
 * FirstOfficer - Workflow DSL Integration Test
 * 
 * Tests the integration between FirstOfficer and the Workflow DSL system.
 */

import { RepositoryFactory, createConnection } from '@starships/models';
import {
  WorkflowDSL,
  ExpeditionStatus,
  WorkflowPhase
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

describe('FirstOfficer Workflow DSL Integration', () => {
  beforeAll(async () => {
    // Initialize Neo4j connection
    const neo4jConfig = {
      uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    };
    
    const connection = createConnection(neo4jConfig);
    await connection.connect();
    
    // Initialize repositories
    await RepositoryFactory.initialize();
  });

  test('should create workflow in database when FirstOfficer generates it', async () => {
    const expeditionId = uuidv4();
    
    // Create a mock workflow (simulating what FirstOfficer would create)
    const mockWorkflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: expeditionId,
      nodes: [
        {
          id: 'start-1',
          type: 'start',
          name: 'Start Test Workflow',
          description: 'Begin workflow execution',
          parameters: {}
        },
        {
          id: 'agent-1',
          type: 'agent',
          name: 'Execute Main Task',
          description: 'Execute the main task using agent',
          parameters: {
            agentId: 'test-agent',
            taskIds: ['task-1'],
            instructions: 'Complete the assigned task'
          }
        },
        {
          id: 'end-1',
          type: 'end',
          name: 'Complete Test Workflow',
          description: 'End workflow execution',
          parameters: {}
        }
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'agent-1' },
        { id: 'e2', from: 'agent-1', to: 'end-1' }
      ],
      visualization: '[START] → [AGENT] → [END]',
      approvalStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    // Save workflow using WorkflowRepository (as FirstOfficer would do)
    const workflowRepo = RepositoryFactory.getWorkflowRepository();
    const savedWorkflow = await workflowRepo.create(mockWorkflow);

    // Verify workflow was saved correctly
    expect(savedWorkflow).toBeDefined();
    expect(savedWorkflow.id).toBe(mockWorkflow.id);
    expect(savedWorkflow.expeditionId).toBe(expeditionId);
    expect(savedWorkflow.nodes).toHaveLength(3);
    expect(savedWorkflow.edges).toHaveLength(2);
    expect(savedWorkflow.approvalStatus).toBe('pending');

    // Verify we can retrieve it
    const retrievedWorkflows = await workflowRepo.findByExpeditionId(expeditionId);
    expect(retrievedWorkflows).toHaveLength(1);
    expect(retrievedWorkflows[0].id).toBe(mockWorkflow.id);

    // Clean up
    await workflowRepo.delete(savedWorkflow.id);
  });

  test('should handle workflow approval status updates', async () => {
    const expeditionId = uuidv4();
    
    const mockWorkflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: expeditionId,
      nodes: [
        {
          id: 'start-1',
          type: 'start',
          name: 'Start Approval Test',
          description: 'Test workflow approval flow',
          parameters: {}
        },
        {
          id: 'end-1',
          type: 'end',
          name: 'Complete Approval Test',
          description: 'End workflow approval test',
          parameters: {}
        }
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'end-1' }
      ],
      visualization: '[START] → [END]',
      approvalStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    const workflowRepo = RepositoryFactory.getWorkflowRepository();
    const savedWorkflow = await workflowRepo.create(mockWorkflow);

    // Test approval
    const approvalSuccess = await workflowRepo.updateApprovalStatus(
      savedWorkflow.id,
      'approved',
      new Date().toISOString()
    );

    expect(approvalSuccess).toBe(true);

    // Verify approval status was updated
    const approvedWorkflow = await workflowRepo.findById(savedWorkflow.id);
    expect(approvedWorkflow?.approvalStatus).toBe('approved');

    // Test rejection
    const rejectionSuccess = await workflowRepo.updateApprovalStatus(
      savedWorkflow.id,
      'rejected',
      new Date().toISOString()
    );

    expect(rejectionSuccess).toBe(true);

    // Verify rejection status was updated
    const rejectedWorkflow = await workflowRepo.findById(savedWorkflow.id);
    expect(rejectedWorkflow?.approvalStatus).toBe('rejected');

    // Clean up
    await workflowRepo.delete(savedWorkflow.id);
  });

  test('should create workflow runtime state for execution tracking', async () => {
    const expeditionId = uuidv4();
    const workflowId = uuidv4();
    
    // Create a runtime state (as would happen during workflow execution)
    const runtimeStateRepo = RepositoryFactory.getWorkflowRuntimeStateRepository();
    
    const mockRuntimeState = {
      id: uuidv4(),
      workflowId: workflowId,
      expeditionId: expeditionId,
      status: 'running' as const,
      currentNodeId: 'start-1',
      startTime: new Date().toISOString(),
      executionResults: new Map(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const savedRuntimeState = await runtimeStateRepo.create(mockRuntimeState);

    expect(savedRuntimeState).toBeDefined();
    expect(savedRuntimeState.id).toBe(mockRuntimeState.id);
    expect(savedRuntimeState.workflowId).toBe(workflowId);
    expect(savedRuntimeState.status).toBe('running');

    // Verify we can find it by workflow ID
    const retrievedState = await runtimeStateRepo.findByWorkflowId(workflowId);
    expect(retrievedState).toBeDefined();
    expect(retrievedState?.id).toBe(mockRuntimeState.id);

    // Update status
    const updateSuccess = await runtimeStateRepo.updateStatus(savedRuntimeState.id, 'completed');
    expect(updateSuccess).toBe(true);

    // Verify status was updated
    const updatedState = await runtimeStateRepo.findById(savedRuntimeState.id);
    expect(updatedState?.status).toBe('completed');

    // Clean up
    await runtimeStateRepo.delete(savedRuntimeState.id);
  });

  test('should validate workflow structure using generation service', async () => {
    const { WorkflowGenerationService } = await import('../../src/services/WorkflowGenerationService');
    const service = new WorkflowGenerationService();

    // Test with a valid workflow structure
    const validWorkflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        {
          id: 'start-1',
          type: 'start',
          name: 'Start Process',
          description: 'Begin workflow',
          parameters: {}
        },
        {
          id: 'end-1',
          type: 'end',
          name: 'Complete Process',
          description: 'End workflow',
          parameters: {}
        }
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'end-1' }
      ],
      visualization: '[START] → [END]',
      approvalStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    const validation = await service.validateWorkflow(validWorkflow);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Test with invalid workflow (no start node)
    const invalidWorkflow: WorkflowDSL = {
      id: uuidv4(),
      expeditionId: uuidv4(),
      nodes: [
        {
          id: 'end-1',
          type: 'end',
          name: 'End Without Start',
          description: 'End workflow without start',
          parameters: {}
        }
      ],
      edges: [],
      visualization: '[END]',
      approvalStatus: 'pending',
      createdAt: new Date().toISOString()
    };

    const invalidValidation = await service.validateWorkflow(invalidWorkflow);
    expect(invalidValidation.valid).toBe(false);
    expect(invalidValidation.errors.length).toBeGreaterThan(0);
    expect(invalidValidation.errors.some(e => e.code === 'MISSING_START_NODE')).toBe(true);
  });

  afterAll(async () => {
    // Clean up any remaining test data
    console.log('FirstOfficer workflow integration tests completed');
  });
});