/**
 * Workflow Execution Engine
 *
 * Core engine for executing workflow DSL graphs. Handles sequential execution,
 * state management, error recovery, and user interaction coordination.
 */

import { NodeHandler, NodeHandlerConstructor } from '@/types/node-handler';
import { Blueprint, Execution, NodeHandlerOptions, NodeResult, Node as WorkflowNode, NodeParameters } from '@/types';
import type { EventCallback, ExecutionEvent, ExecutionEventType } from '@/types/events';
import { ParamProcessor } from './ParamProcessor';
import { TransformProcessor } from './TransformProcessor';

// Dynamic imports for handlers - pure lazy loading
const HANDLER_MAP: Record<string, () => Promise<NodeHandlerConstructor>> = {
  start: () => import('@/nodes/Start').then((m) => m.Start as NodeHandlerConstructor),
  end: () => import('@/nodes/End').then((m) => m.End as NodeHandlerConstructor),
  agent: () => import('@/nodes/Agent').then((m) => m.Agent as NodeHandlerConstructor),
  workflow: () => import('@/nodes/Workflow').then((m) => m.Workflow as NodeHandlerConstructor),
  http_request: () => import('@/nodes/HttpRequest').then((m) => m.HttpRequest as NodeHandlerConstructor),
  llm: () => import('@/nodes/LLM').then((m) => m.LLM as NodeHandlerConstructor),
  user_prompt: () => import('@/nodes/UserPrompt').then((m) => m.UserPrompt as NodeHandlerConstructor),
  conditional: () => import('@/nodes/Conditional').then((m) => m.Conditional as NodeHandlerConstructor),
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
  private paramProcessor: ParamProcessor;
  private transformProcessor: TransformProcessor;

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
    this.paramProcessor = new ParamProcessor();
    this.transformProcessor = new TransformProcessor();
  }

  /**
   * Create handler instance for a node with pure dynamic loading
   */
  async createHandler(node: WorkflowNode, resolvedParams: NodeParameters): Promise<NodeHandler> {
    const loader = HANDLER_MAP[node.type];
    if (!loader) {
      throw new Error(`No handler available for node type: ${node.type}`);
    }

    // Load handler constructor dynamically each time
    const handlerConstructor = await loader();

    const handlerOptions = {
      eventCallback: this.eventCallback,
      execution: this.execution,
    } as NodeHandlerOptions;

    return new handlerConstructor(resolvedParams, handlerOptions);
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

      // Re-throw error for tests that expect it
      throw error;
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
          // Node succeeded - continue normal execution
          const nextNode = this.getNextNode();

          if (!nextNode) {
            break; // No next node, workflow complete
          }

          currentNode = nextNode;
        } else {
          // Node failed - check if there's error recovery logic
          const nextNode = this.getNextNode();

          if (nextNode && this.hasErrorRecoveryPath(currentNode.ref)) {
            // There's a next node and error recovery logic, continue execution
            currentNode = nextNode;
          } else {
            // No error recovery - fail the workflow
            this.execution.status = 'failed';
            this.execution.error = {
              code: 'SYSTEM_ERROR',
              message: result.error instanceof Error ? result.error.message : String(result.error),
              timestamp: new Date().toISOString(),
              recoverable: false,
            };
            await this.emitEvent('workflow_failed');
            break;
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Node execution failed';

        // Store failed result
        const failedResult: NodeResult = {
          nodeRef: currentNode.ref,
          error: errorMessage,
        };
        this.execution.results.push(failedResult);

        // Set workflow status to failed and break execution
        this.execution.status = 'failed';
        this.execution.error = {
          code: 'SYSTEM_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
          recoverable: false,
        };
        await this.emitEvent('workflow_failed');
        break;
      }
    }

    // Clear current node when done
    this.execution.currentNodeRef = undefined;
  }

  /**
   * Execute a single node with template resolution and transforms
   */
  private async executeNode(node: WorkflowNode): Promise<NodeResult> {
    this.emitEvent('node_started');

    const result = {
      nodeRef: node.ref,
    } as NodeResult;

    try {
      // Step 1: Resolve template expressions in parameters
      const resolvedParams = (await this.paramProcessor.resolveTemplates(node.parameters, this.execution)) as NodeParameters;

      // Step 2: Create handler instance with resolved parameters
      const handler = await this.createHandler(node, resolvedParams);

      // Step 3: Execute the node
      const data = await handler.execute();
      result.data = data;

      // Step 4: Apply transforms after successful execution
      const nodeParams = node.parameters as { transform?: string | string[] };
      if (nodeParams.transform) {
        await this.transformProcessor.applyTransforms(nodeParams.transform, this.execution, result);
      }

      this.emitEvent('node_completed');
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

    if (outgoingEdges.length > 0) {
      // Get the last execution result to check for conditional output
      const lastResult = this.execution.results[this.execution.results.length - 1];
      let edgeCondition: string | undefined;

      // Check if last result was from a conditional node
      if (lastResult?.data && typeof lastResult.data === 'object') {
        const conditionalResult = lastResult.data as Record<string, unknown>;
        if (conditionalResult.condition !== undefined) {
          edgeCondition = String(conditionalResult.condition);
        }
      }

      // If we have an edge condition, look for matching edge
      if (edgeCondition) {
        const matchingEdge = outgoingEdges.find((edge) => edge.condition === edgeCondition);
        if (matchingEdge) {
          return this.blueprint.nodes.find((node) => node.ref === matchingEdge.to) || null;
        }

        // For boolean conditions, also check for 'true'/'false' string matches
        const boolMatchingEdge = outgoingEdges.find(
          (edge) => (edge.condition === 'true' && edgeCondition === 'true') || (edge.condition === 'false' && edgeCondition === 'false')
        );
        if (boolMatchingEdge) {
          return this.blueprint.nodes.find((node) => node.ref === boolMatchingEdge.to) || null;
        }
      } else {
        // No conditional result, use first edge without condition or first edge
        const defaultEdge = outgoingEdges.find((edge) => !edge.condition) || outgoingEdges[0];
        if (defaultEdge) {
          return this.blueprint.nodes.find((node) => node.ref === defaultEdge.to) || null;
        }
      }
    }

    // If we get here, check if current node is an end node
    const currentNode = this.blueprint.nodes.find((node) => this.execution.currentNodeRef === node.ref);
    if (currentNode?.type !== 'end') {
      throw new Error(`Engine exited unexpectedly, at Node: ${currentNode?.ref}`);
    }

    return null;
  }

  /**
   * Validate workflow before execution
   */
  private async validateForExecution(blueprint: Blueprint): Promise<void> {
    // Check for start node
    const startNode = this.blueprint?.nodes?.find((node) => node.type === 'start') || null;
    if (!startNode) {
      throw new Error('Workflow must have a start node');
    }

    // Check that all node types have available handlers
    const unsupportedNodes = [];
    const validationErrors: string[] = [];

    for (const node of blueprint.nodes) {
      if (!(node.type in HANDLER_MAP)) {
        unsupportedNodes.push({ ref: node.ref, type: node.type });
        continue;
      }

      // Validate template expressions in parameters
      const templateValidation = this.paramProcessor.validateTemplateExpressions(node.parameters);
      if (!templateValidation.valid) {
        const errorMessages = templateValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
        validationErrors.push(...errorMessages);
      }

      // Validate transform expressions if present
      const nodeParams = node.parameters as { transform?: string | string[] };
      if (nodeParams.transform) {
        const transformValidation = this.transformProcessor.validateTransforms(nodeParams.transform);
        if (!transformValidation.valid) {
          const errorMessages = transformValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
          validationErrors.push(...errorMessages);
        }
      }
    }

    if (unsupportedNodes.length > 0) {
      throw new Error(`Unsupported node types: ${unsupportedNodes.map((n) => n.type).join(', ')}`);
    }

    if (validationErrors.length > 0) {
      throw new Error(`Template/Transform validation failed:\n${validationErrors.join('\n')}`);
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
   * Check if there are conditional nodes that can handle errors from the given node
   */
  private hasErrorRecoveryPath(nodeRef: string): boolean {
    // Look for outgoing edges from this node
    const outgoingEdges = this.blueprint.edges.filter((edge) => edge.from === nodeRef);

    if (outgoingEdges.length === 0) {
      return false;
    }

    // Check if any of the target nodes are conditional nodes
    for (const edge of outgoingEdges) {
      const targetNode = this.blueprint.nodes.find((node) => node.ref === edge.to);
      if (targetNode && targetNode.type === 'conditional') {
        return true;
      }
    }

    return false;
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
