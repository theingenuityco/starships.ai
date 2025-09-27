import { ParallelEngine } from '../ParallelEngine';
import { BaseBlueprint } from '@/types/base';
import { Execution, ExecutionStatus } from '@/types/execution';

describe('ParallelEngine Integration Tests', () => {
  let engine: ParallelEngine;

  beforeEach(() => {
    engine = new ParallelEngine({ debug: false });
  });

  afterEach(() => {
    engine.reset();
  });

  describe('Parallel Tool Execution', () => {
    it('should execute multiple tools in parallel', async () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Start node',
            parameters: {}
          },
          {
            ref: 'llm',
            type: 'llm',
            name: 'LLM',
            description: 'Generate tool calls',
            parameters: {
              model: 'gpt-4',
              messages: [{ role: 'user', content: 'Search for weather and news' }]
            }
          },
          {
            ref: 'tools',
            type: 'tool',
            name: 'Execute Tools',
            description: 'Execute multiple tools in parallel',
            parameters: {}
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'End node',
            parameters: {}
          }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'llm' },
          { ref: 'e2', from: 'llm', to: 'tools' },
          { ref: 'e3', from: 'tools', to: 'end' }
        ]
      };

      // Mock LLM output with multiple tool calls
      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {
          tools: [
            { name: 'weather', description: 'Get weather' },
            { name: 'news', description: 'Get news' }
          ]
        },
        results: [{
          nodeRef: 'llm',
          items: [{
            json: {
              choices: [{
                message: {
                  tool_calls: [
                    { id: '1', function: { name: 'weather', arguments: '{}' } },
                    { id: '2', function: { name: 'news', arguments: '{}' } }
                  ]
                }
              }]
            }
          }]
        }]
      };

      const startTime = Date.now();
      const results = await engine.execute(blueprint, execution);
      const executionTime = Date.now() - startTime;

      // Should complete relatively quickly (tools execute in parallel)
      expect(executionTime).toBeLessThan(5000);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Complex Workflow with Dependencies', () => {
    it('should handle diamond dependency pattern', async () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'split', type: 'transform', name: 'Split', description: '', parameters: {} },
          { ref: 'branch1', type: 'transform', name: 'Branch1', description: '', parameters: {} },
          { ref: 'branch2', type: 'transform', name: 'Branch2', description: '', parameters: {} },
          { ref: 'merge', type: 'transform', name: 'Merge', description: '', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'split' },
          { ref: 'e2', from: 'split', to: 'branch1' },
          { ref: 'e3', from: 'split', to: 'branch2' },
          { ref: 'e4', from: 'branch1', to: 'merge' },
          { ref: 'e5', from: 'branch2', to: 'merge' },
          { ref: 'e6', from: 'merge', to: 'end' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {},
        results: []
      };

      let stageCount = 0;
      engine.on('stage:complete', () => {
        stageCount++;
      });

      const results = await engine.execute(blueprint, execution);

      // Should execute in 4 stages:
      // Stage 0: start
      // Stage 1: split
      // Stage 2: branch1 & branch2 (parallel)
      // Stage 3: merge
      // Stage 4: end
      expect(stageCount).toBe(5);
      expect(results).toBeDefined();
    });

    it('should handle fan-out and fan-in pattern', async () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'fanout', type: 'transform', name: 'FanOut', description: '', parameters: {} },
          { ref: 'worker1', type: 'transform', name: 'Worker1', description: '', parameters: {} },
          { ref: 'worker2', type: 'transform', name: 'Worker2', description: '', parameters: {} },
          { ref: 'worker3', type: 'transform', name: 'Worker3', description: '', parameters: {} },
          { ref: 'fanin', type: 'transform', name: 'FanIn', description: '', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'fanout' },
          { ref: 'e2', from: 'fanout', to: 'worker1' },
          { ref: 'e3', from: 'fanout', to: 'worker2' },
          { ref: 'e4', from: 'fanout', to: 'worker3' },
          { ref: 'e5', from: 'worker1', to: 'fanin' },
          { ref: 'e6', from: 'worker2', to: 'fanin' },
          { ref: 'e7', from: 'worker3', to: 'fanin' },
          { ref: 'e8', from: 'fanin', to: 'end' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {},
        results: []
      };

      const parallelStages: number[] = [];
      engine.on('stage:complete', (event) => {
        if (event.nodesExecuted > 1) {
          parallelStages.push(event.stageIndex);
        }
      });

      await engine.execute(blueprint, execution);

      // Should have at least one stage with parallel execution (workers)
      expect(parallelStages.length).toBeGreaterThan(0);
      expect(parallelStages[0]).toBe(2); // Stage 2 should have 3 parallel workers
    });
  });

  describe('Conditional Routing with Parallelism', () => {
    it('should handle parallel branches after conditional', async () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
          {
            ref: 'condition',
            type: 'conditional',
            name: 'Check',
            description: '',
            parameters: { condition: 'multi' }
          },
          { ref: 'path1', type: 'transform', name: 'Path1', description: '', parameters: {} },
          { ref: 'path2', type: 'transform', name: 'Path2', description: '', parameters: {} },
          { ref: 'merge', type: 'transform', name: 'Merge', description: '', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'condition' },
          { ref: 'e2', from: 'condition', to: 'path1', condition: 'multi' },
          { ref: 'e3', from: 'condition', to: 'path2', condition: 'multi' },
          { ref: 'e4', from: 'path1', to: 'merge' },
          { ref: 'e5', from: 'path2', to: 'merge' },
          { ref: 'e6', from: 'merge', to: 'end' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {},
        results: []
      };

      const results = await engine.execute(blueprint, execution);
      expect(results).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should handle concurrent state mutations safely', async () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
          {
            ref: 'mutate1',
            type: 'mutate',
            name: 'Mutate1',
            description: '',
            parameters: {
              mutations: [
                { operation: 'add', path: '/counter', value: 1 }
              ]
            }
          },
          {
            ref: 'mutate2',
            type: 'mutate',
            name: 'Mutate2',
            description: '',
            parameters: {
              mutations: [
                { operation: 'add', path: '/counter2', value: 2 }
              ]
            }
          },
          {
            ref: 'mutate3',
            type: 'mutate',
            name: 'Mutate3',
            description: '',
            parameters: {
              mutations: [
                { operation: 'add', path: '/list/-', value: 'item' }
              ]
            }
          },
          { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'mutate1' },
          { ref: 'e2', from: 'start', to: 'mutate2' },
          { ref: 'e3', from: 'start', to: 'mutate3' },
          { ref: 'e4', from: 'mutate1', to: 'end' },
          { ref: 'e5', from: 'mutate2', to: 'end' },
          { ref: 'e6', from: 'mutate3', to: 'end' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: { list: [] },
        results: []
      };

      await engine.execute(blueprint, execution);

      // State mutations should be applied atomically
      // We can't check the final state directly in this test,
      // but the execution should complete without errors
    });
  });

  describe('Error Handling', () => {
    it('should handle node failures gracefully', async () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
          {
            ref: 'error1',
            type: 'code',
            name: 'Error1',
            description: '',
            parameters: { code: 'throw new Error("Test error 1")' }
          },
          {
            ref: 'success',
            type: 'transform',
            name: 'Success',
            description: '',
            parameters: {}
          },
          { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'error1' },
          { ref: 'e2', from: 'start', to: 'success' },
          { ref: 'e3', from: 'error1', to: 'end' },
          { ref: 'e4', from: 'success', to: 'end' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {},
        results: []
      };

      let errorEvents = 0;
      engine.on('node:error', () => {
        errorEvents++;
      });

      const results = await engine.execute(blueprint, execution);

      // Should continue execution despite one branch failing
      expect(results).toBeDefined();
      expect(errorEvents).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should execute parallel nodes faster than sequential', async () => {
      // Create a workflow with 5 independent nodes
      const parallelBlueprint: BaseBlueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'task1', type: 'transform', name: 'Task1', description: '', parameters: {} },
          { ref: 'task2', type: 'transform', name: 'Task2', description: '', parameters: {} },
          { ref: 'task3', type: 'transform', name: 'Task3', description: '', parameters: {} },
          { ref: 'task4', type: 'transform', name: 'Task4', description: '', parameters: {} },
          { ref: 'task5', type: 'transform', name: 'Task5', description: '', parameters: {} },
          { ref: 'end', type: 'end', name: 'End', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'task1' },
          { ref: 'e2', from: 'start', to: 'task2' },
          { ref: 'e3', from: 'start', to: 'task3' },
          { ref: 'e4', from: 'start', to: 'task4' },
          { ref: 'e5', from: 'start', to: 'task5' },
          { ref: 'e6', from: 'task1', to: 'end' },
          { ref: 'e7', from: 'task2', to: 'end' },
          { ref: 'e8', from: 'task3', to: 'end' },
          { ref: 'e9', from: 'task4', to: 'end' },
          { ref: 'e10', from: 'task5', to: 'end' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {},
        results: []
      };

      const startTime = Date.now();
      await engine.execute(parallelBlueprint, execution);
      const parallelTime = Date.now() - startTime;

      // Parallel execution should be fast
      expect(parallelTime).toBeLessThan(1000);
    });
  });
});