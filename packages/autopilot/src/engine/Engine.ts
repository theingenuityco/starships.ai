/**
 * Workflow Execution Engine
 *
 * Core engine for executing workflow DSL graphs. Handles sequential execution,
 * state management, error recovery, and user interaction coordination.
 */

import { Handler, HandlerConstructor } from '@/nodes/Handler';
import { Blueprint, Execution, NodeResult, Node as WorkflowNode } from '@/types';
import type { EngineEmitter, ExecutionEvent } from '@/types/emitters';

// Dynamic imports for handlers - pure lazy loading
const HANDLER_MAP: Record<string, () => Promise<HandlerConstructor>> = {
  start: () => import('@/nodes/handlers/StartHandler').then((m) => m.StartHandler),
  end: () => import('@/nodes/handlers/EndHandler').then((m) => m.EndHandler),
  agent: () => import('@/nodes/handlers/AgentHandler').then((m) => m.AgentHandler),
  conditional: () => import('@/nodes/handlers/ConditionalHandler').then((m) => m.ConditionalHandler),
  user_prompt: () => import('@/nodes/handlers/PromptHandler').then((m) => m.PromptHandler),
  output: () => import('@/nodes/handlers/OutputHandler').then((m) => m.OutputHandler),
  http_request: () => import('@/nodes/handlers/HttpRequestHandler').then((m) => m.HttpRequestHandler),
  llm: () => import('@/nodes/handlers/LlmHandler').then((m) => m.LlmHandler),
  workflow: () => import('@/nodes/handlers/WorkflowHandler').then((m) => m.WorkflowHandler),
};

/**
 * Main workflow execution engine
 */
export class Engine {
  private blueprint: Blueprint;
  private execution!: Execution;
  private emitter?: EngineEmitter;

  constructor(blueprint: Blueprint) {
    this.blueprint = blueprint;
  }

  /**
   * Set streaming emitter (injected by external systems like server)
   */
  setEmitter(emitter: EngineEmitter): void {
    this.emitter = emitter;
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
  async execute(initialExecution?: Partial<Execution>): Promise<Execution> {
    this.execution = {
      status: initialExecution?.status || 'not_started',
      state: initialExecution?.state || {},
      results: initialExecution?.results || new Map(),
      currentNodeRef: initialExecution?.currentNodeRef,
      error: initialExecution?.error,
    };

    try {
      // Validate workflow before execution
      await this.validateForExecution(this.blueprint);

      // Find start node
      const startNode = this.getStartNode(this.blueprint);
      if (!startNode) {
        throw new Error('No start node found in workflow');
      }

      // Emit start event
      await this.emitEvent({
        type: 'workflow_started',
        execution: this.execution,
        timestamp: new Date().toISOString(),
      });

      // Update execution state
      this.execution.status = 'running';

      // Execute workflow graph
      await this.executeGraph(this.blueprint, this.execution);

      // Mark as completed if no errors
      if (this.execution.status === 'running') {
        this.execution.status = 'completed';

        await this.emitEvent({
          type: 'workflow_completed',
          execution: this.execution,
          timestamp: new Date().toISOString(),
        });
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

      await this.emitEvent({
        type: 'workflow_failed',
        execution: this.execution,
        timestamp: new Date().toISOString(),
      });
    } finally {
      // Execution cleanup completed
    }

    return this.execution;
  }

  /**
   * Execute the workflow graph node by node
   */
  private async executeGraph(blueprint: Blueprint, execution: Execution): Promise<void> {
    let currentNode = this.getStartNode(blueprint);

    while (currentNode && execution.status === 'running') {
      try {
        // Update current node
        execution.currentNodeRef = currentNode.ref;

        // Emit node start event
        await this.emitEvent({
          type: 'node_started',
          execution: execution,
          timestamp: new Date().toISOString(),
        });

        // Execute the node - this now returns updated execution with result stored
        const updatedExecution = await this.executeNode(currentNode, execution);

        // Get the result that was stored by the handler
        const result = updatedExecution.results.get(currentNode.ref);
        if (!result) {
          throw new Error(`Handler failed to store result for node ${currentNode.ref}`);
        }

        if (!result.error) {
          // Emit node completed event
          await this.emitEvent({
            type: 'node_completed',
            execution: updatedExecution,
            timestamp: new Date().toISOString(),
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
            execution: updatedExecution,
            timestamp: new Date().toISOString(),
          });

          throw new Error(`Node execution failed: ${result.error}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Node execution failed';

        // Store failed result
        const failedResult: NodeResult = {
          nodeRef: currentNode.ref,
          error: errorMessage,
        };
        execution.results.set(currentNode.ref, failedResult);

        throw error;
      }
    }

    // Clear current node when done
    execution.currentNodeRef = undefined;
  }

  /**
   * Execute a single node with lazy loading
   */
  private async executeNode(node: WorkflowNode, execution: Execution): Promise<Execution> {
    // Create handler instance with parameters (now async)
    const handler = await this.createHandler(node);

    // Pass streaming emitter to handler if it supports streaming
    if ('setEmitter' in handler && typeof handler.setEmitter === 'function') {
      (handler as Handler & { setEmitter: (emitter?: EngineEmitter) => void }).setEmitter(this.emitter);
    }

    // Execute the node - this returns execution with result stored
    const updatedExecution = await handler.execute(execution);

    return updatedExecution;
  }

  /**
   * Find the start node in the workflow
   */
  private getStartNode(blueprint: Blueprint): WorkflowNode | null {
    return blueprint.nodes.find((node) => node.type === 'start') || null;
  }

  /**
   * Find the next node based on current node and edge condition
   */
  private getNextNode(blueprint: Blueprint, currentNode: WorkflowNode, edgeCondition?: string): WorkflowNode | null {
    // Find edges from current node
    const outgoingEdges = blueprint.edges.filter((edge) => edge.from === currentNode.ref);

    if (outgoingEdges.length === 0) {
      return null; // No outgoing edges, workflow complete
    }

    // If we have an edge condition, look for matching edge
    if (edgeCondition) {
      const matchingEdge = outgoingEdges.find((edge) => edge.condition === edgeCondition);
      if (matchingEdge) {
        return blueprint.nodes.find((node) => node.ref === matchingEdge.to) || null;
      }
    }

    // Look for default edge (no condition)
    const defaultEdge = outgoingEdges.find((edge) => !edge.condition);
    if (defaultEdge) {
      return blueprint.nodes.find((node) => node.ref === defaultEdge.to) || null;
    }

    // If no matching edge found and we have edges, take the first one
    if (outgoingEdges.length > 0) {
      return blueprint.nodes.find((node) => node.ref === outgoingEdges[0].to) || null;
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

    this.emitEvent({
      type: 'workflow_paused',
      execution: this.execution,
      timestamp: new Date().toISOString(),
    });

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

    this.emitEvent({
      type: 'workflow_resumed',
      execution: this.execution,
      timestamp: new Date().toISOString(),
    });

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

  /**
   * Get execution status
   */
  getExecutionStatus(): Execution {
    return this.execution;
  }

  /**
   * Get current execution state
   */
  getCurrentExecution(): Execution {
    return this.execution;
  }

  /**
   * Emit workflow execution event via streaming emitter
   */
  private async emitEvent(event: ExecutionEvent): Promise<void> {
    // Delegate streaming to injected emitter if available and enabled
    if (this.emitter?.isEnabled()) {
      try {
        await this.emitter.emitExecutionEvent(event);
      } catch (error) {
        // Silent fail for streaming events to not interrupt execution
        console.error('Error in external streaming emitter:', error);
      }
    }
  }

  /**
   * Emit content chunk for streaming (public method for LLM and other components)
   */
  async emitContentChunk(content: string, accumulated: string, nodeRef?: string, model?: string): Promise<void> {
    if (!this.execution) {
      return;
    }

    const event: ExecutionEvent = {
      type: 'content_chunk',
      execution: this.execution,
      timestamp: new Date().toISOString(),
      content,
      contentMetadata: {
        accumulated,
        isComplete: false,
        nodeRef: nodeRef || this.execution.currentNodeRef,
        model,
      },
    };

    await this.emitEvent(event);
  }

  /**
   * Emit content completion for streaming
   */
  async emitContentComplete(finalContent: string, nodeRef?: string, model?: string): Promise<void> {
    if (!this.execution) {
      return;
    }

    const event: ExecutionEvent = {
      type: 'content_complete',
      execution: this.execution,
      timestamp: new Date().toISOString(),
      content: finalContent,
      contentMetadata: {
        accumulated: finalContent,
        isComplete: true,
        nodeRef: nodeRef || this.execution.currentNodeRef,
        model,
      },
    };

    await this.emitEvent(event);
  }
}
