/**
 * Workflow Execution Engine
 *
 * Core engine for executing workflow DSL graphs. Handles sequential execution,
 * state management, error recovery, and user interaction coordination.
 */

import { NodeHandler, NodeHandlerConstructor } from '@/engine/NodeHandler';
import { Blueprint, Execution, NodeResult, Node as WorkflowNode } from '@/types';
import type { EventCallback, ExecutionEvent, ExecutionEventType } from '@/types/emitters';

// Dynamic imports for handlers - pure lazy loading
const HANDLER_MAP: Record<string, () => Promise<NodeHandlerConstructor>> = {
  start: () => import('@/nodes/Start').then((m) => m.Start as NodeHandlerConstructor),
  end: () => import('@/nodes/End').then((m) => m.End as NodeHandlerConstructor),
  agent: () => import('@/nodes/Agent').then((m) => m.Agent as NodeHandlerConstructor),
  workflow: () => import('@/nodes/Workflow').then((m) => m.Workflow as NodeHandlerConstructor),
  http_request: () => import('@/nodes/HttpRequest').then((m) => m.HttpRequest as NodeHandlerConstructor),
  // conditional: () => import('@/nodes/handlers/ConditionalHandler').then((m) => m.ConditionalHandler),
  // user_prompt: () => import('@/nodes/handlers/PromptHandler').then((m) => m.PromptHandler),
  // output: () => import('@/nodes/handlers/OutputHandler').then((m) => m.OutputHandler),
  // llm: () => import('@/nodes/handlers/LlmHandler').then((m) => m.LlmHandler),
};

export interface EngineConfig {
  blueprint: Blueprint;
  execution?: Execution;
  eventCallback?: EventCallback;
}

/**
 * Main workflow execution engine
 */
export class Engine {
  private blueprint: Blueprint;
  private execution: Execution;
  private eventCallback?: EventCallback;

  constructor(config: EngineConfig) {
    this.blueprint = config.blueprint;

    const initialExecution = {
      status: config.execution?.status || 'not_started',
      currentNodeRef: config.execution?.currentNodeRef,
      results: config.execution?.results || [],
      state: config.execution?.state || {},
    } as Execution;

    this.execution = initialExecution;
    this.eventCallback = config.eventCallback;
  }

  /**
   * Create handler instance for a node with pure dynamic loading
   */
  async createHandler(node: WorkflowNode): Promise<NodeHandler> {
    const loader = HANDLER_MAP[node.type];
    if (!loader) {
      throw new Error(`No handler available for node type: ${node.type}`);
    }

    // Load handler constructor dynamically each time
    const handlerConstructor = await loader();
    return new handlerConstructor(node.parameters, this.eventCallback);
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
  async execute(): Promise<void> {
    try {
      // Validate workflow before execution
      await this.validateForExecution(this.blueprint);

      // Find start node
      const startNode = this.getStartNode();
      if (!startNode) {
        throw new Error('No start node found in workflow');
      }

      // Emit start event
      await this.emitEvent('workflow_started');

      // Update execution state
      this.execution.status = 'running';

      // Execute workflow graph
      await this.executeGraph();

      // Mark as completed if no errors
      if (this.execution.status === 'running') {
        this.execution.status = 'completed';

        await this.emitEvent('workflow_completed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.execution.status = 'failed';
      this.execution.error = {
        code: 'SYSTEM_ERROR',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        recoverable: false,
      };

      await this.emitEvent('workflow_failed');
    }
  }

  /**
   * Execute the workflow graph node by node
   */
  private async executeGraph(): Promise<void> {
    let currentNode = this.getStartNode();

    while (currentNode && this.execution.status === 'running') {
      try {
        // Update current node
        this.execution.currentNodeRef = currentNode.ref;

        // Execute the node - this now returns updated execution with result stored
        const result = await this.executeNode(currentNode);
        if (!result.error) {
          // Find next node
          const nextNode = this.getNextNode();

          if (!nextNode) {
            break; // No next node, workflow complete
          }

          currentNode = nextNode;
        } else {
          throw new Error(`Node execution failed: ${result.error}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Node execution failed';

        // Store failed result
        const failedResult: NodeResult = {
          nodeRef: currentNode.ref,
          error: errorMessage,
        };
        this.execution.results.push(failedResult);

        throw error;
      }
    }

    // Clear current node when done
    this.execution.currentNodeRef = undefined;
  }

  /**
   * Execute a single node with lazy loading
   */
  private async executeNode(node: WorkflowNode): Promise<NodeResult> {
    this.emitEvent('node_started');

    const result = {
      nodeRef: node.ref,
    } as NodeResult;
    try {
      // Create handler instance with parameters (now async)
      const handler = await this.createHandler(node);
      // Execute the node - this returns execution with result stored
      const data = await handler.execute();
      result.data = data;
      this.emitEvent('node_started');
    } catch (error) {
      result.error = error;
      this.emitEvent('node_failed');
    }
    this.execution.results.push(result);

    return result;
  }

  /**
   * Find the start node in the workflow
   */
  private getStartNode(): WorkflowNode | null {
    return this.blueprint.nodes.find((node) => node.type === 'start') || null;
  }

  /**
   * Find the next node based on current node and edge condition
   */
  private getNextNode(): WorkflowNode | null {
    // Find edges from current node
    const outgoingEdges = this.blueprint.edges.filter((edge) => edge.from === this.execution.currentNodeRef);

    if (outgoingEdges.length === 0) {
      return null; // No outgoing edges, workflow complete
    }

    // // If we have an edge condition, look for matching edge
    // if (edgeCondition) {
    //   const matchingEdge = outgoingEdges.find((edge) => edge.condition === edgeCondition);
    //   if (matchingEdge) {
    //     return this.blueprint.nodes.find((node) => node.ref === matchingEdge.to) || null;
    //   }
    // }

    // Look for default edge (no condition)
    const defaultEdge = outgoingEdges.find((edge) => !edge.condition);
    if (defaultEdge) {
      return this.blueprint.nodes.find((node) => node.ref === defaultEdge.to) || null;
    }

    // If no matching edge found and we have edges, take the first one
    if (outgoingEdges.length > 0) {
      return this.blueprint.nodes.find((node) => node.ref === outgoingEdges[0].to) || null;
    }

    return null;
  }

  /**
   * Validate workflow before execution
   */
  private async validateForExecution(blueprint: Blueprint): Promise<void> {
    // Check for start node
    const startNode = this.getStartNode();
    if (!startNode) {
      throw new Error('Workflow must have a start node');
    }

    // Check that all node types have available handlers
    const unsupportedNodes = [];
    for (const node of blueprint.nodes) {
      if (!(node.type in HANDLER_MAP)) {
        unsupportedNodes.push({ ref: node.ref, type: node.type });
      }
    }

    if (unsupportedNodes.length > 0) {
      throw new Error(`Unsupported node types: ${unsupportedNodes.map((n) => n.type).join(', ')}`);
    }
  }

  /**
   * Pause workflow execution
   */
  pause(): boolean {
    if (!this.execution || this.execution.status !== 'running') {
      return false;
    }

    this.execution.status = 'paused';

    this.emitEvent('workflow_paused');

    return true;
  }

  /**
   * Resume workflow execution
   */
  resume(): boolean {
    if (!this.execution || this.execution.status !== 'paused') {
      return false;
    }

    this.execution.status = 'running';

    this.emitEvent('workflow_resumed');

    return true;
  }

  /**
   * Cancel workflow execution
   */
  cancel(): boolean {
    if (!this.execution || this.execution.status === 'completed' || this.execution.status === 'failed') {
      return false;
    }

    this.execution.status = 'cancelled';

    return true;
  }

  getExecution() {
    return this.execution;
  }

  /**
   * Emit workflow execution event via streaming emitter
   */
  private async emitEvent(type: ExecutionEventType): Promise<void> {
    // Delegate streaming to injected emitter if available and enabled
    if (this.eventCallback) {
      try {
        const event = {
          type: type,
          timestamp: new Date().toISOString(),
          data: {
            execution: this.execution,
          },
        } as ExecutionEvent;
        await this.eventCallback(event);
      } catch (error) {
        // Silent fail for streaming events to not interrupt execution
        console.error('Error in external streaming emitter:', error);
      }
    }
  }
}
