/**
 * Workflow DSL Performance Tests
 * 
 * Tests for workflow generation and execution performance.
 * Validates that workflows meet performance requirements.
 */

import { WorkflowGenerationService } from '../../src/services/WorkflowGenerationService';
import { WorkflowExecutionService } from '../../src/services/WorkflowExecutionService';
import { setupBasicHandlers } from '../setup-basic-handlers';
import { workflowNodeRegistry } from '../../src/services/WorkflowNodeRegistry';
import {
  WorkflowGenerationRequest,
  WorkflowDSL,
  WorkflowDSLNode,
  WorkflowExecutionContext
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

describe('Workflow DSL Performance Tests', () => {
  let workflowGenerationService: WorkflowGenerationService;
  let workflowExecutionService: WorkflowExecutionService;

  beforeAll(() => {
    // Setup basic handlers for testing
    setupBasicHandlers(workflowNodeRegistry);
    
    workflowGenerationService = new WorkflowGenerationService();
    workflowExecutionService = WorkflowExecutionService.getInstance();
  });

  describe('6.2.1 Workflow Generation Performance', () => {
    test('should generate simple workflow under 10 seconds', async () => {
      const startTime = Date.now();
      
      const request: WorkflowGenerationRequest = {
        expeditionId: uuidv4(),
        objective: 'Performance test workflow',
        taskBreakdown: [
          { id: 'task-1', title: 'Task 1', description: 'Simple task 1' },
          { id: 'task-2', title: 'Task 2', description: 'Simple task 2' },
          { id: 'task-3', title: 'Task 3', description: 'Simple task 3' }
        ],
        selectedAgents: [
          {
            agentId: 'perf-agent-1',
            agentName: 'Performance Agent',
            skills: ['general'],
            availability: 'available',
            assignedTasks: []
          }
        ]
      };

      const result = await workflowGenerationService.generateWorkflow(request);
      
      const duration = Date.now() - startTime;
      console.log(`Simple workflow generation took ${duration}ms`);
      
      expect(duration).toBeLessThan(10000); // Less than 10 seconds
      expect(result.workflow).toBeDefined();
      expect(result.metadata.generationTime).toBeLessThan(10000);
    }, 15000);

    test('should generate complex workflow efficiently', async () => {
      const startTime = Date.now();
      
      // Create a complex workflow with many tasks
      const taskBreakdown = Array.from({ length: 20 }, (_, i) => ({
        id: `perf-task-${i + 1}`,
        title: `Performance Task ${i + 1}`,
        description: `Complex performance task ${i + 1} with detailed description and requirements`
      }));

      const selectedAgents = Array.from({ length: 5 }, (_, i) => ({
        agentId: `perf-agent-${i + 1}`,
        agentName: `Performance Agent ${i + 1}`,
        skills: ['skill1', 'skill2', 'skill3'],
        availability: 'available' as const,
        assignedTasks: []
      }));

      const request: WorkflowGenerationRequest = {
        expeditionId: uuidv4(),
        objective: 'Complex performance test workflow with many tasks and agents',
        taskBreakdown,
        selectedAgents,
        complexity: 'complex'
      };

      const result = await workflowGenerationService.generateWorkflow(request);
      
      const duration = Date.now() - startTime;
      console.log(`Complex workflow generation took ${duration}ms`);
      
      expect(duration).toBeLessThan(15000); // Less than 15 seconds for complex workflow
      expect(result.workflow.nodes.length).toBeGreaterThan(15); // Should have many nodes
      expect(result.confidence).toBeGreaterThan(0.5);
    }, 20000);

    test('should scale generation time linearly with task count', async () => {
      const taskCounts = [5, 10, 15];
      const generationTimes: number[] = [];

      for (const taskCount of taskCounts) {
        const startTime = Date.now();

        const taskBreakdown = Array.from({ length: taskCount }, (_, i) => ({
          id: `scale-task-${i + 1}`,
          title: `Scale Task ${i + 1}`,
          description: `Scaling test task ${i + 1}`
        }));

        const request: WorkflowGenerationRequest = {
          expeditionId: uuidv4(),
          objective: `Scaling test with ${taskCount} tasks`,
          taskBreakdown,
          selectedAgents: [
            {
              agentId: 'scale-agent',
              agentName: 'Scale Agent',
              skills: ['general'],
              availability: 'available',
              assignedTasks: []
            }
          ]
        };

        await workflowGenerationService.generateWorkflow(request);
        const duration = Date.now() - startTime;
        generationTimes.push(duration);

        console.log(`${taskCount} tasks took ${duration}ms`);
      }

      // Each increase should not be exponential
      const ratios = generationTimes.slice(1).map((time, i) => 
        time / generationTimes[i]
      );
      
      ratios.forEach(ratio => {
        expect(ratio).toBeLessThan(5); // Should not be more than 5x slower
      });
    }, 30000);
  });

  describe('6.2.2 Workflow Execution Performance', () => {
    test('should execute simple workflow nodes under 5 seconds average', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start Performance Test',
            description: 'Start performance test workflow',
            parameters: {}
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'Complete Performance Test',
            description: 'Complete performance test workflow',
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

      const startTime = Date.now();
      
      const result = await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'perf-test-user'
      });

      const executionTime = Date.now() - startTime;
      console.log(`Simple workflow execution took ${executionTime}ms`);

      expect(executionTime).toBeLessThan(5000); // Less than 5 seconds
      expect(result.status).toBe('completed');
    }, 10000);

    test('should handle large workflow efficiently', async () => {
      // Create a workflow with many sequential nodes
      const nodes: WorkflowDSLNode[] = [
        {
          id: 'start-1',
          type: 'start',
          name: 'Start Large Workflow',
          description: 'Start large workflow test',
          parameters: {}
        }
      ];

      const edges: any[] = [];

      // Add many output nodes (they execute quickly)
      for (let i = 1; i <= 10; i++) {
        const outputId = `output-${i}`;
        nodes.push({
          id: outputId,
          type: 'output',
          name: `Output ${i}`,
          description: `Generate output ${i}`,
          parameters: {
            template: 'simple',
            sources: ['start-1'],
            format: 'text'
          }
        });

        edges.push({
          id: `e-start-${i}`,
          from: 'start-1',
          to: outputId
        });
      }

      // Add end node
      const endNodeId = 'end-1';
      nodes.push({
        id: endNodeId,
        type: 'end',
        name: 'Complete Large Workflow',
        description: 'Complete large workflow test',
        parameters: {}
      });

      // Connect all outputs to end
      for (let i = 1; i <= 10; i++) {
        edges.push({
          id: `e-output-${i}`,
          from: `output-${i}`,
          to: endNodeId
        });
      }

      const largeWorkflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes,
        edges,
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      const startTime = Date.now();
      
      const result = await workflowExecutionService.executeWorkflow(largeWorkflow, {
        expeditionId: largeWorkflow.expeditionId,
        userId: 'perf-test-user'
      });

      const executionTime = Date.now() - startTime;
      console.log(`Large workflow execution took ${executionTime}ms`);

      expect(executionTime).toBeLessThan(15000); // Less than 15 seconds for large workflow
      expect(result.status).toBe('completed');
      expect(result.executionResults.size).toBeGreaterThan(5);
    }, 20000);

    test('should track execution progress in real-time', async () => {
      const events: any[] = [];
      
      workflowExecutionService.onEvent(async (event) => {
        events.push({
          type: event.type,
          timestamp: new Date().toISOString(),
          nodeId: event.nodeId
        });
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
            id: 'output-1',
            type: 'output',
            name: 'Generate Output',
            description: 'Generate test output',
            parameters: {
              template: 'test',
              sources: ['start-1'],
              format: 'text'
            }
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
          { id: 'e1', from: 'start-1', to: 'output-1' },
          { id: 'e2', from: 'output-1', to: 'end-1' }
        ],
        visualization: '',
        approvalStatus: 'approved',
        createdAt: new Date().toISOString()
      };

      await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'perf-test-user'
      });

      expect(events.length).toBeGreaterThan(2);
      expect(events.some(e => e.type === 'workflow_started')).toBe(true);
      expect(events.some(e => e.type === 'node_started')).toBe(true);
      expect(events.some(e => e.type === 'node_completed')).toBe(true);
      expect(events.some(e => e.type === 'workflow_completed')).toBe(true);

      // Events should be in chronological order
      const timestamps = events.map(e => new Date(e.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    }, 15000);
  });

  describe('6.2.3 Memory and Resource Usage', () => {
    test('should handle workflow execution without memory leaks', async () => {
      const initialMemory = process.memoryUsage();
      
      // Execute multiple workflows to test for memory leaks
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const workflow: WorkflowDSL = {
          id: uuidv4(),
          expeditionId: uuidv4(),
          nodes: [
            {
              id: 'start-1',
              type: 'start',
              name: `Start Memory Test ${i}`,
              description: 'Memory test workflow',
              parameters: {}
            },
            {
              id: 'end-1',
              type: 'end',
              name: `End Memory Test ${i}`,
              description: 'Complete memory test',
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

        promises.push(workflowExecutionService.executeWorkflow(workflow, {
          expeditionId: workflow.expeditionId,
          userId: `mem-test-user-${i}`
        }));
      }

      await Promise.all(promises);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory increase: ${memoryIncrease / 1024 / 1024}MB`);
      console.log(`Initial heap: ${initialMemory.heapUsed / 1024 / 1024}MB`);
      console.log(`Final heap: ${finalMemory.heapUsed / 1024 / 1024}MB`);

      // Memory increase should be reasonable (less than 50MB for 5 workflows)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 30000);

    test('should clean up execution state after completion', async () => {
      const workflow: WorkflowDSL = {
        id: uuidv4(),
        expeditionId: uuidv4(),
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            name: 'Start Cleanup Test',
            description: 'Test cleanup workflow',
            parameters: {}
          },
          {
            id: 'end-1',
            type: 'end',
            name: 'End Cleanup Test',
            description: 'Complete cleanup test',
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

      const initialRunningExecutions = workflowExecutionService.getRunningExecutions().length;

      await workflowExecutionService.executeWorkflow(workflow, {
        expeditionId: workflow.expeditionId,
        userId: 'cleanup-test-user'
      });

      const finalRunningExecutions = workflowExecutionService.getRunningExecutions().length;

      // Should not have any additional running executions after completion
      expect(finalRunningExecutions).toBe(initialRunningExecutions);
    }, 10000);
  });

  describe('6.2.4 Concurrent Execution Performance', () => {
    test('should handle multiple concurrent workflow executions', async () => {
      const concurrentCount = 3;
      const promises = [];
      
      const startTime = Date.now();

      for (let i = 0; i < concurrentCount; i++) {
        const workflow: WorkflowDSL = {
          id: uuidv4(),
          expeditionId: uuidv4(),
          nodes: [
            {
              id: 'start-1',
              type: 'start',
              name: `Concurrent Start ${i}`,
              description: `Concurrent test workflow ${i}`,
              parameters: {}
            },
            {
              id: 'end-1',
              type: 'end',
              name: `Concurrent End ${i}`,
              description: `Complete concurrent test ${i}`,
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

        promises.push(workflowExecutionService.executeWorkflow(workflow, {
          expeditionId: workflow.expeditionId,
          userId: `concurrent-user-${i}`
        }));
      }

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      console.log(`${concurrentCount} concurrent workflows took ${totalTime}ms`);

      // All workflows should complete successfully
      results.forEach(result => {
        expect(result.status).toBe('completed');
      });

      // Concurrent execution should not be much slower than sequential
      // (This is a rough estimate, actual performance will vary)
      expect(totalTime).toBeLessThan(10000); // Less than 10 seconds for 3 concurrent workflows
    }, 15000);
  });
});

afterAll(() => {
  console.log('Workflow performance tests completed');
});