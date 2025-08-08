/**
 * Debug Workflow Execution Test
 * 
 * Simple test to debug workflow execution issues
 */

import { WorkflowExecutionService } from '../src/services/WorkflowExecutionService';
import { WorkflowDSL } from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

describe('Debug Workflow Execution', () => {
  let workflowExecutionService: WorkflowExecutionService;

  beforeAll(() => {
    workflowExecutionService = WorkflowExecutionService.getInstance();
  });

  test('should debug simple workflow execution', async () => {
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

    try {
      const result = await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'debug-user'
      });

      console.error('Execution result:', JSON.stringify(result, null, 2));
      console.error('Result status:', result.status);
      console.error('Result error:', result.error);
      console.error('Execution results size:', result.executionResults.size);
      
      if (result.status === 'failed') {
        console.error('Failure reason:', result.error);
      }

      expect(result.status).toBe('completed');
    } catch (error) {
      console.error('Test execution error:', error);
      throw error;
    }
  }, 10000);
});