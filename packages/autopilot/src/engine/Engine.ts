/**
 * Workflow Execution Engine
 * 
 * Core engine for executing workflow DSL graphs. Handles sequential execution,
 * state management, error recovery, and user interaction coordination.
 */

import { Blueprint, RuntimeState, ExecutionContext, Node as WorkflowNode, NodeResult } from '../types';
import { Handler, HandlerConstructor } from '../nodes/Handler';
import { v4 as uuidv4 } from 'uuid';

// Dynamic imports for handlers - pure lazy loading
const HANDLER_MAP: Record<string, () => Promise<HandlerConstructor>> = {
  'start': () => import('../nodes/handlers/StartHandler').then(m => m.StartHandler),
  'end': () => import('../nodes/handlers/EndHandler').then(m => m.EndHandler),
  'agent': () => import('../nodes/handlers/AgentHandler').then(m => m.AgentHandler),
  'conditional': () => import('../nodes/handlers/ConditionalHandler').then(m => m.ConditionalHandler),
  'user_prompt': () => import('../nodes/handlers/PromptHandler').then(m => m.PromptHandler),
  'output': () => import('../nodes/handlers/OutputHandler').then(m => m.OutputHandler),
  'http_request': () => import('../nodes/handlers/HttpRequestHandler').then(m => m.HttpRequestHandler),
  'llm': () => import('../nodes/handlers/LlmHandler').then(m => m.LlmHandler),
  'workflow': () => import('../nodes/handlers/WorkflowHandler').then(m => m.WorkflowHandler),
};

/**
 * Events that can be emitted during workflow execution
 */
export interface ExecutionEvent {
  type: 'workflow_started' | 'node_started' | 'node_completed' | 'node_failed' |
        'workflow_paused' | 'workflow_resumed' | 'workflow_completed' | 'workflow_failed';
  contextId: string;
  nodeId?: string;
  data?: any;
  timestamp: string;
}

/**
 * Callback for workflow execution events
 */
export type EventCallback = (event: ExecutionEvent) => Promise<void>;

/**
 * Main workflow execution engine
 */
export class Engine {
  private eventCallbacks: EventCallback[] = [];
  private runningExecutions: Map<string, RuntimeState> = new Map();

  constructor() {
    // Engine is completely stateless for handlers - pure dynamic loading
  }

  /**
   * Create handler instance for a node with pure dynamic loading
   */
  async createHandler(node: WorkflowNode): Promise<Handler> {
    const loader = HANDLER_MAP[node.type];
    if (!loader) {
      throw new Error(`No handler available for node type: ${node.type}`);
    }
    
    // Load handler constructor dynamically each time
    const handlerConstructor = await loader();
    return new handlerConstructor(node);
  }

  /**
   * Get all available handler types
   */
  getSupportedTypes(): string[] {
    return Object.keys(HANDLER_MAP);
  }

  /**
   * Check if a node type is supported
   */
  hasHandler(type: string): boolean {
    return type in HANDLER_MAP;
  }

  /**
   * Execute a workflow from start to completion
   */
  async execute(
    blueprint: Blueprint,
    context: Partial<ExecutionContext>
  ): Promise<RuntimeState> {
    const executionId = uuidv4();
    
    // Initialize runtime state
    const runtimeState: RuntimeState = {
      id: executionId,
      
      currentNodeId: undefined,
      status: 'not_started',
      executionResults: new Map(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store in running executions
    this.runningExecutions.set(executionId, runtimeState);

    try {
      // Validate workflow before execution
      await this.validateForExecution(blueprint);

      // Find start node
      const startNode = this.getStartNode(blueprint);
      if (!startNode) {
        throw new Error('No start node found in workflow');
      }

      // Emit start event
      await this.emitEvent({
        type: 'workflow_started',
        
        contextId: runtimeState.id,
        timestamp: new Date().toISOString()
      });

      // Update runtime state
      runtimeState.status = 'running';
      runtimeState.startTime = new Date().toISOString();
      runtimeState.updatedAt = new Date().toISOString();

      // Execute workflow graph
      await this.executeGraph(blueprint, runtimeState, context);

      // Mark as completed if no errors
      if (runtimeState.status === 'running') {
        runtimeState.status = 'completed';
        runtimeState.endTime = new Date().toISOString();
        runtimeState.updatedAt = new Date().toISOString();

        await this.emitEvent({
          type: 'workflow_completed',
          
          contextId: runtimeState.id,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      runtimeState.status = 'failed';
      runtimeState.endTime = new Date().toISOString();
      runtimeState.updatedAt = new Date().toISOString();
      runtimeState.error = {
        code: 'SYSTEM_ERROR',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        recoverable: false
      };

      await this.emitEvent({
        type: 'workflow_failed',
        
        contextId: runtimeState.id,
        data: { error: errorMessage },
        timestamp: new Date().toISOString()
      });
    } finally {
      // Clean up running execution
      this.runningExecutions.delete(executionId);
    }

    return runtimeState;
  }

  /**
   * Execute the workflow graph node by node
   */
  private async executeGraph(
    blueprint: Blueprint,
    runtimeState: RuntimeState,
    contextData: Partial<ExecutionContext>
  ): Promise<void> {
    let currentNode = this.getStartNode(blueprint);
    
    // Build execution context
    const context: ExecutionContext = {
      
      userId: contextData.userId || 'system',
      previousResults: runtimeState.executionResults,
      expeditionState: contextData.expeditionState || {},
      services: contextData.services || {}
    };

    while (currentNode && runtimeState.status === 'running') {
      try {
        // Update current node
        runtimeState.currentNodeId = currentNode.id;
        runtimeState.updatedAt = new Date().toISOString();

        // Emit node start event
        await this.emitEvent({
          type: 'node_started',
          
          contextId: runtimeState.id,
          nodeId: currentNode.id,
          data: { nodeName: currentNode.name, nodeType: currentNode.type },
          timestamp: new Date().toISOString()
        });

        // Execute the node
        const result = await this.executeNode(currentNode, context);
        
        // Store result
        runtimeState.executionResults.set(currentNode.id, result);

        if (result.success) {
          // Emit node completed event
          await this.emitEvent({
            type: 'node_completed',
            
            contextId: runtimeState.id,
            nodeId: currentNode.id,
            data: { result: result.data },
            timestamp: new Date().toISOString()
          });

          // Find next node
          const nextNode = this.getNextNode(blueprint, currentNode, result.nextEdgeCondition);
          
          if (!nextNode) {
            break; // No next node, workflow complete
          }

          currentNode = nextNode;

        } else {
          // Node execution failed
          await this.emitEvent({
            type: 'node_failed',
            
            contextId: runtimeState.id,
            nodeId: currentNode.id,
            data: { error: result.error },
            timestamp: new Date().toISOString()
          });

          throw new Error(`Node execution failed: ${result.error}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Node execution failed';
        
        // Store failed result
        const failedResult: NodeResult = {
          nodeId: currentNode.id,
          success: false,
          error: errorMessage,
          executedAt: new Date().toISOString(),
          duration: 0
        };
        runtimeState.executionResults.set(currentNode.id, failedResult);

        throw error;
      }
    }

    // Clear current node when done
    runtimeState.currentNodeId = undefined;
    runtimeState.updatedAt = new Date().toISOString();
  }

  /**
   * Execute a single node with lazy loading
   */
  private async executeNode(
    node: WorkflowNode,
    context: ExecutionContext
  ): Promise<NodeResult> {
    // Create handler instance with parameters (now async)
    const handler = await this.createHandler(node);

    // Execute the node
    const startTime = Date.now();
    const result = await handler.execute(context);
    const duration = Date.now() - startTime;

    // Update duration if not set by handler
    if (!result.duration) {
      result.duration = duration;
    }

    return result;
  }

  /**
   * Find the start node in the workflow
   */
  private getStartNode(blueprint: Blueprint): WorkflowNode | null {
    return blueprint.nodes.find(node => node.type === 'start') || null;
  }

  /**
   * Find the next node based on current node and edge condition
   */
  private getNextNode(
    blueprint: Blueprint,
    currentNode: WorkflowNode,
    edgeCondition?: string
  ): WorkflowNode | null {
    // Find edges from current node
    const outgoingEdges = blueprint.edges.filter(edge => edge.from === currentNode.id);

    if (outgoingEdges.length === 0) {
      return null; // No outgoing edges, workflow complete
    }

    // If we have an edge condition, look for matching edge
    if (edgeCondition) {
      const matchingEdge = outgoingEdges.find(edge => edge.condition === edgeCondition);
      if (matchingEdge) {
        return blueprint.nodes.find(node => node.id === matchingEdge.to) || null;
      }
    }

    // Look for default edge (no condition)
    const defaultEdge = outgoingEdges.find(edge => !edge.condition);
    if (defaultEdge) {
      return blueprint.nodes.find(node => node.id === defaultEdge.to) || null;
    }

    // If no matching edge found and we have edges, take the first one
    if (outgoingEdges.length > 0) {
      return blueprint.nodes.find(node => node.id === outgoingEdges[0].to) || null;
    }

    return null;
  }

  /**
   * Validate workflow before execution
   */
  private async validateForExecution(blueprint: Blueprint): Promise<void> {
    // Check for start node
    const startNode = this.getStartNode(blueprint);
    if (!startNode) {
      throw new Error('Workflow must have a start node');
    }

    // Check that all node types have available handlers
    const unsupportedNodes = [];
    for (const node of blueprint.nodes) {
      if (!(node.type in HANDLER_MAP)) {
        unsupportedNodes.push({ id: node.id, type: node.type });
      }
    }

    if (unsupportedNodes.length > 0) {
      throw new Error(`Unsupported node types: ${unsupportedNodes.map(n => n.type).join(', ')}`);
    }
  }

  /**
   * Pause workflow execution
   */
  pause(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status !== 'running') {
      return false;
    }

    runtimeState.status = 'paused';
    runtimeState.pausedAt = new Date().toISOString();
    runtimeState.updatedAt = new Date().toISOString();

    this.emitEvent({
      type: 'workflow_paused',
      
      contextId: '',
      timestamp: new Date().toISOString()
    });

    return true;
  }

  /**
   * Resume workflow execution
   */
  resume(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status !== 'paused') {
      return false;
    }

    runtimeState.status = 'running';
    runtimeState.pausedAt = undefined;
    runtimeState.updatedAt = new Date().toISOString();

    this.emitEvent({
      type: 'workflow_resumed',
      
      contextId: '',
      timestamp: new Date().toISOString()
    });

    return true;
  }

  /**
   * Cancel workflow execution
   */
  cancel(executionId: string): boolean {
    const runtimeState = this.runningExecutions.get(executionId);
    if (!runtimeState || runtimeState.status === 'completed' || runtimeState.status === 'failed') {
      return false;
    }

    runtimeState.status = 'cancelled';
    runtimeState.endTime = new Date().toISOString();
    runtimeState.updatedAt = new Date().toISOString();

    this.runningExecutions.delete(executionId);
    return true;
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId: string): RuntimeState | null {
    return this.runningExecutions.get(executionId) || null;
  }

  /**
   * Get all running executions
   */
  getRunningExecutions(): RuntimeState[] {
    return Array.from(this.runningExecutions.values());
  }

  /**
   * Register event callback
   */
  onEvent(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Remove event callback
   */
  offEvent(callback: EventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  /**
   * Emit workflow execution event
   */
  private async emitEvent(event: ExecutionEvent): Promise<void> {
    // Call all registered callbacks
    for (const callback of this.eventCallbacks) {
      try {
        await callback(event);
      } catch (error) {
        // Silent fail for event callbacks to not interrupt execution
        console.error('Error in workflow event callback:', error);
      }
    }
  }
}