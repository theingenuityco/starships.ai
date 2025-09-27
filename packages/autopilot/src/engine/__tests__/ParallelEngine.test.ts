import { ParallelEngine } from '../ParallelEngine';
import { DynamicStageRouter } from '../DynamicStageRouter';
import { ParallelStateManager } from '../ParallelStateManager';
import { StageContext } from '../StageContext';
import { BaseBlueprint, BaseNode } from '@/types/base';
import { Execution, ExecutionStatus } from '@/types/execution';

describe('ParallelEngine', () => {
  let engine: ParallelEngine;

  beforeEach(() => {
    engine = new ParallelEngine({ debug: false });
  });

  afterEach(() => {
    engine.reset();
  });

  describe('Basic Execution', () => {
    it('should execute a simple linear workflow', async () => {
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
            ref: 'process',
            type: 'transform',
            name: 'Process',
            description: 'Process data',
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
          { ref: 'e1', from: 'start', to: 'process' },
          { ref: 'e2', from: 'process', to: 'end' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {},
        results: [{ nodeRef: 'start', items: [{ json: { input: 'test' } }] }]
      };

      const results = await engine.execute(blueprint, execution);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should execute parallel nodes simultaneously', async () => {
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
            ref: 'parallel1',
            type: 'transform',
            name: 'Parallel 1',
            description: 'First parallel node',
            parameters: {}
          },
          {
            ref: 'parallel2',
            type: 'transform',
            name: 'Parallel 2',
            description: 'Second parallel node',
            parameters: {}
          },
          {
            ref: 'merge',
            type: 'transform',
            name: 'Merge',
            description: 'Merge results',
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
          { ref: 'e1', from: 'start', to: 'parallel1' },
          { ref: 'e2', from: 'start', to: 'parallel2' },
          { ref: 'e3', from: 'parallel1', to: 'merge' },
          { ref: 'e4', from: 'parallel2', to: 'merge' },
          { ref: 'e5', from: 'merge', to: 'end' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {},
        results: []
      };

      let stageEvents: any[] = [];
      engine.on('stage:complete', (event) => {
        stageEvents.push(event);
      });

      const results = await engine.execute(blueprint, execution);
      
      // Check that parallel nodes were executed in the same stage
      expect(stageEvents.length).toBeGreaterThan(0);
      const parallelStage = stageEvents.find(e => e.nodesExecuted === 2);
      expect(parallelStage).toBeDefined();
    });
  });

  describe('Conditional Routing', () => {
    it('should route based on conditional node results', async () => {
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
            ref: 'condition',
            type: 'conditional',
            name: 'Check Condition',
            description: 'Conditional node',
            parameters: { condition: 'true' }
          },
          {
            ref: 'truePath',
            type: 'transform',
            name: 'True Path',
            description: 'Executed when true',
            parameters: {}
          },
          {
            ref: 'falsePath',
            type: 'transform',
            name: 'False Path',
            description: 'Executed when false',
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
          { ref: 'e1', from: 'start', to: 'condition' },
          { ref: 'e2', from: 'condition', to: 'truePath', condition: 'true' },
          { ref: 'e3', from: 'condition', to: 'falsePath', condition: 'false' },
          { ref: 'e4', from: 'truePath', to: 'end' },
          { ref: 'e5', from: 'falsePath', to: 'end' }
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

  describe('Cycle Detection', () => {
    it('should detect and prevent infinite loops', async () => {
      // Create engine with lower max visits for testing
      const testEngine = new ParallelEngine({ debug: false, maxVisits: 2 });
      
      const blueprint: BaseBlueprint = {
        nodes: [
          {
            ref: 'loop1',
            type: 'transform',
            name: 'Loop 1',
            description: 'First loop node',
            parameters: {}
          },
          {
            ref: 'loop2',
            type: 'transform',
            name: 'Loop 2',
            description: 'Second loop node',
            parameters: {}
          }
        ],
        edges: [
          { ref: 'e1', from: 'loop1', to: 'loop2' },
          { ref: 'e2', from: 'loop2', to: 'loop1' }
        ]
      };

      const execution: Execution = {
        status: 'not_started' as ExecutionStatus,
        state: {},
        results: []
      };

      // Should throw error when max visits exceeded
      await expect(testEngine.execute(blueprint, execution)).rejects.toThrow('Maximum visits');
    });
  });
});

describe('DynamicStageRouter', () => {
  let router: DynamicStageRouter;

  beforeEach(() => {
    router = new DynamicStageRouter();
  });

  describe('Start Node Detection', () => {
    it('should identify start nodes correctly', () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: '', parameters: {} },
          { ref: 'node1', type: 'transform', name: 'Node 1', description: '', parameters: {} },
          { ref: 'node2', type: 'transform', name: 'Node 2', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'node1' }
        ]
      };

      const startNodes = router.getStartNodes(blueprint);
      expect(startNodes).toEqual(['node1']);
    });

    it('should detect nodes with no incoming edges as start nodes', () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          { ref: 'node1', type: 'transform', name: 'Node 1', description: '', parameters: {} },
          { ref: 'node2', type: 'transform', name: 'Node 2', description: '', parameters: {} },
          { ref: 'node3', type: 'transform', name: 'Node 3', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'node1', to: 'node3' }
        ]
      };

      const startNodes = router.getStartNodes(blueprint);
      expect(startNodes).toContain('node1');
      expect(startNodes).toContain('node2');
      expect(startNodes).not.toContain('node3');
    });
  });

  describe('Cycle Detection', () => {
    it('should detect simple cycles', () => {
      const blueprint: BaseBlueprint = {
        nodes: [
          { ref: 'a', type: 'transform', name: 'A', description: '', parameters: {} },
          { ref: 'b', type: 'transform', name: 'B', description: '', parameters: {} },
          { ref: 'c', type: 'transform', name: 'C', description: '', parameters: {} }
        ],
        edges: [
          { ref: 'e1', from: 'a', to: 'b' },
          { ref: 'e2', from: 'b', to: 'c' },
          { ref: 'e3', from: 'c', to: 'a' }
        ]
      };

      const cycles = router.detectCycles(blueprint);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('a');
      expect(cycles[0]).toContain('b');
      expect(cycles[0]).toContain('c');
    });
  });
});

describe('ParallelStateManager', () => {
  let stateManager: ParallelStateManager;

  beforeEach(() => {
    stateManager = new ParallelStateManager();
  });

  describe('Mutation Operations', () => {
    it('should apply add mutations', async () => {
      const state = { items: [] };
      
      stateManager.queueMutations('node1', [
        { operation: 'add', path: '/items/-', value: 'item1' }
      ]);
      stateManager.queueMutations('node2', [
        { operation: 'add', path: '/items/-', value: 'item2' }
      ]);

      const newState = await stateManager.commitStageMutations(state, 0);
      expect((newState as any).items).toEqual(['item1', 'item2']);
    });

    it('should apply replace mutations', async () => {
      const state = { value: 'old' };
      
      stateManager.queueMutations('node1', [
        { operation: 'replace', path: '/value', value: 'new' }
      ]);

      const newState = await stateManager.commitStageMutations(state, 0);
      expect((newState as any).value).toBe('new');
    });

    it('should apply remove mutations', async () => {
      const state = { items: ['a', 'b', 'c'], extra: 'value' };
      
      stateManager.queueMutations('node1', [
        { operation: 'remove', path: '/items/1' },
        { operation: 'remove', path: '/extra' }
      ]);

      const newState = await stateManager.commitStageMutations(state, 0);
      expect((newState as any).items).toEqual(['a', 'c']);
      expect((newState as any).extra).toBeUndefined();
    });

    it('should maintain immutability', async () => {
      const state = { value: 'original' };
      const originalState = { ...state };
      
      stateManager.queueMutations('node1', [
        { operation: 'replace', path: '/value', value: 'modified' }
      ]);

      const newState = await stateManager.commitStageMutations(state, 0);
      
      expect(state).toEqual(originalState);
      expect(newState).not.toBe(state);
      expect((newState as any).value).toBe('modified');
    });
  });
});

describe('StageContext', () => {
  it('should resolve templates correctly', () => {
    const blueprint: BaseBlueprint = {
      nodes: [],
      edges: []
    };

    const execution = {
      blueprint,
      state: { 
        config: { 
          apiKey: 'test-key' 
        } 
      },
      nodeResults: new Map([
        ['prevNode', { 
          nodeRef: 'prevNode', 
          nodeType: 'transform', 
          items: [{ json: { result: 'previous' } }] 
        }]
      ])
    } as any;

    const stage = {
      nodes: [],
      stageIndex: 1,
      parallelCount: 1
    };

    const context = new StageContext(stage, execution);

    // Test state resolution
    const stateTemplate = '{{ state.config.apiKey }}';
    expect(context.resolveTemplate(stateTemplate)).toBe('test-key');

    // Test node output resolution (backward compat)
    const nodeTemplate = '$lastOutputOf("prevNode")';
    expect(context.resolveTemplate(nodeTemplate)).toEqual({ result: 'previous' });
  });
});