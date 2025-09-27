import { EventEmitter } from 'events';
import { BaseBlueprint, BaseNode, Edge } from '@/types/base';
import { Execution, ExecutionItem, ExecutionState, ExecutionStatus, ExecutionError } from '@/types/execution';
import { DynamicStageRouter } from './DynamicStageRouter';
import { ParallelStateManager } from './ParallelStateManager';
import { StageContext } from './StageContext';
import { createNodeHandler, BaseNodeHandler } from '@/nodes';

export interface EngineConfig {
  maxVisits?: number;
  defaultTimeout?: number;
  debug?: boolean;
}

export interface NodeExecutionResult {
  nodeRef: string;
  nodeType: string;
  items: ExecutionItem[];
  routingInfo?: {
    edgeCondition?: string;
  };
  error?: ExecutionError;
}

export interface ExecutionStage {
  nodes: BaseNode[];
  stageIndex: number;
  parallelCount: number;
}

export interface ParallelExecution extends Execution {
  blueprint: BaseBlueprint;
  stages: Array<{ nodeRefs: string[]; stageIndex: number }>;
  nodeResults: Map<string, NodeExecutionResult>;
  initialInputs?: ExecutionItem[];
}

export class ParallelEngine extends EventEmitter {
  private router: DynamicStageRouter;
  private stateManager: ParallelStateManager;
  private nodeRegistry: Map<string, any>;
  private visitCounts: Map<string, number>;
  private readonly MAX_VISITS: number;
  private readonly DEFAULT_TIMEOUT: number;
  private debug: boolean;

  constructor(config: EngineConfig = {}) {
    super();
    this.router = new DynamicStageRouter();
    this.stateManager = new ParallelStateManager();
    this.nodeRegistry = new Map();
    this.visitCounts = new Map();
    this.MAX_VISITS = config.maxVisits || 10;
    this.DEFAULT_TIMEOUT = config.defaultTimeout || 30000;
    this.debug = config.debug || false;
  }

  async execute(blueprint: BaseBlueprint, execution: Execution): Promise<ExecutionItem[]> {
    const parallelExecution = this.initializeExecution(execution, blueprint);
    
    // Start with entry nodes (no incoming edges or from 'start')
    let currentNodeRefs = this.router.getStartNodes(blueprint);
    let stageIndex = 0;
    
    // Dynamic execution loop - stages determined at runtime
    while (currentNodeRefs.length > 0) {
      // Check for cycles
      for (const nodeRef of currentNodeRefs) {
        const visits = (this.visitCounts.get(nodeRef) || 0) + 1;
        if (visits > this.MAX_VISITS) {
          throw new Error(`Maximum visits (${this.MAX_VISITS}) exceeded for node: ${nodeRef}`);
        }
        this.visitCounts.set(nodeRef, visits);
      }
      
      // Create stage from current nodes
      const stageNodes = currentNodeRefs.map(ref => 
        blueprint.nodes.find(n => n.ref === ref)!
      ).filter(Boolean);
      
      if (stageNodes.length === 0) {
        break;
      }
      
      const stage: ExecutionStage = {
        nodes: stageNodes,
        stageIndex,
        parallelCount: stageNodes.length
      };
      
      const stageContext = new StageContext(stage, parallelExecution);
      
      // Execute all nodes in this stage in parallel
      const nodePromises = stageNodes.map(node => 
        this.executeNodeWithContext(node, stageContext)
      );
      
      // Wait for all parallel executions
      const results = await Promise.allSettled(nodePromises);
      
      // Process results and collect routing information
      const stageResults = await this.processStageResults(
        results, 
        stage, 
        parallelExecution
      );
      
      // Apply state mutations atomically for this stage
      parallelExecution.state = await this.stateManager.commitStageMutations(
        parallelExecution.state,
        stageIndex
      );
      
      // Emit stage completion event
      this.emit('stage:complete', { 
        stageIndex,
        nodesExecuted: stage.nodes.length,
        results 
      });
      
      // Record stage info
      parallelExecution.stages.push({
        nodeRefs: currentNodeRefs,
        stageIndex
      });
      
      // CRITICAL: Dynamically determine next nodes based on results
      currentNodeRefs = this.router.determineNextNodes(
        stageResults,
        blueprint,
        parallelExecution
      );
      
      if (this.debug) {
        console.log(`Stage ${stageIndex} completed. Next nodes:`, currentNodeRefs);
      }
      
      stageIndex++;
    }
    
    return this.extractFinalResults(parallelExecution);
  }

  private initializeExecution(execution: Execution, blueprint: BaseBlueprint): ParallelExecution {
    return {
      ...execution,
      blueprint,
      stages: [],
      nodeResults: new Map(),
      initialInputs: execution.results?.[0]?.items || [],
      status: 'running' as ExecutionStatus
    };
  }

  private async executeNodeWithContext(
    node: BaseNode,
    context: StageContext
  ): Promise<NodeExecutionResult> {
    try {
      const handler = await this.createNodeHandler(node, context);
      const inputs = context.getNodeInputs(node.ref);
      
      const result = await this.executeWithTimeout(
        handler.execute(inputs),
        node.parameters.timeout as number || this.DEFAULT_TIMEOUT
      );
      
      // Include routing information for conditional nodes
      let routingInfo = undefined;
      if (node.type === 'conditional' && result[0]?.json) {
        const jsonData = result[0].json as any;
        routingInfo = {
          edgeCondition: jsonData.edgeCondition || jsonData.result || String(jsonData)
        };
      }
      
      // Store result in context
      context.setNodeResult(node.ref, result);
      
      return {
        nodeRef: node.ref,
        nodeType: node.type,
        items: result,
        routingInfo
      };
    } catch (error: any) {
      return this.handleNodeError(node, error, context);
    }
  }

  private async createNodeHandler(node: BaseNode, context: StageContext): Promise<BaseNodeHandler> {
    // Create handler with options
    const handler = createNodeHandler(node, {
      execution: context.execution,
      eventCallback: async (event: any) => {
        this.emit('node:event', event);
      }
    });
    
    // Set the stage context for parallel execution
    handler.setContext(context);
    
    // Validate the handler configuration
    const validation = handler.validate();
    if (!validation.valid && validation.errors) {
      throw new Error(`Node ${node.ref} validation failed: ${validation.errors.map((e: any) => e.message).join(', ')}`);
    }
    
    return handler;
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout exceeded: ${timeout}ms`)), timeout)
      )
    ]);
  }

  private async processStageResults(
    results: PromiseSettledResult<NodeExecutionResult>[],
    stage: ExecutionStage,
    parallelExecution: ParallelExecution
  ): Promise<NodeExecutionResult[]> {
    const stageResults: NodeExecutionResult[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const node = stage.nodes[i];
      
      if (result.status === 'fulfilled') {
        // Store successful result
        parallelExecution.nodeResults.set(node.ref, result.value);
        parallelExecution.results.push({
          nodeRef: node.ref,
          items: result.value.items
        });
        stageResults.push(result.value);
      } else {
        // Handle failure
        const error: ExecutionError = {
          code: 'NODE_EXECUTION_FAILED',
          message: result.reason?.message || 'Unknown error',
          nodeRef: node.ref,
          timestamp: new Date().toISOString(),
          recoverable: false
        };
        
        const errorResult: NodeExecutionResult = {
          nodeRef: node.ref,
          nodeType: node.type,
          items: [],
          error
        };
        
        parallelExecution.nodeResults.set(node.ref, errorResult);
        stageResults.push(errorResult);
        
        // Emit error event
        this.emit('node:error', { node, error });
      }
    }
    
    return stageResults;
  }

  private handleNodeError(node: BaseNode, error: any, context: StageContext): NodeExecutionResult {
    const executionError: ExecutionError = {
      code: 'NODE_EXECUTION_FAILED',
      message: error.message || 'Unknown error',
      nodeRef: node.ref,
      details: error,
      timestamp: new Date().toISOString(),
      recoverable: false
    };
    
    return {
      nodeRef: node.ref,
      nodeType: node.type,
      items: [],
      error: executionError
    };
  }

  private extractFinalResults(parallelExecution: ParallelExecution): ExecutionItem[] {
    // Find the last executed nodes and return their results
    const lastStage = parallelExecution.stages[parallelExecution.stages.length - 1];
    if (!lastStage) {
      return [];
    }
    
    const finalResults: ExecutionItem[] = [];
    for (const nodeRef of lastStage.nodeRefs) {
      const nodeResult = parallelExecution.nodeResults.get(nodeRef);
      if (nodeResult && !nodeResult.error) {
        finalResults.push(...nodeResult.items);
      }
    }
    
    return finalResults;
  }

  // Public API for registering node handlers
  registerNodeHandler(nodeType: string, handler: any): void {
    this.nodeRegistry.set(nodeType, handler);
  }

  // Reset state for fresh execution
  reset(): void {
    this.visitCounts.clear();
    this.removeAllListeners();
  }
}