/**
 * Workflow Execution Engine
 *
 * Core engine for executing workflow DSL graphs. Handles sequential execution,
 * state management, error recovery, and user interaction coordination.
 */

import { NodeHandler, NodeHandlerConstructor } from '@/types/node-handler';
import { Blueprint, Execution, NodeHandlerOptions, Node as WorkflowNode, NodeParameters, ExecutionItem } from '@/types';
import type { EventCallback, ExecutionEvent, ExecutionEventType } from '@/types/events';
import type { TransformOperation } from '@/types/node-parameters';
import { Eval } from './Eval';
import { NodeHelpers } from '@/helpers/NodeHelpers';

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
  transform: () => import('@/nodes/Transform').then((m) => m.Transform as NodeHandlerConstructor),
  mutate: () => import('@/nodes/Mutate').then((m) => m.Mutate as NodeHandlerConstructor),
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
  private eval: Eval;

  constructor(config: EngineConfig) {
    this.blueprint = config.blueprint;

    const initialExecution = {
      status: config.execution?.status || 'not_started',
      currentNodeRef: config.execution?.currentNodeRef,
      nodeOutputs: config.execution?.nodeOutputs || {},
      state: config.execution?.state || {},
    } as Execution;

    this.execution = initialExecution;
    this.eventCallback = config.eventCallback;
    this.eval = new Eval();
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

        // Get input items for current node
        const inputItems = this.getNodeInput(currentNode);

        // Execute the node
        const outputItems = await this.executeNode(currentNode, inputItems);

        // Store output items
        this.execution.nodeOutputs[currentNode.ref] = outputItems;

        // Get next node
        const nextNode = this.getNextNode();

        if (!nextNode) {
          break; // No next node, workflow complete
        }

        currentNode = nextNode;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Node execution failed';

        // Store failed output
        this.execution.nodeOutputs[currentNode.ref] = NodeHelpers.createErrorOutput(errorMessage);

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
   * Get input items for a node based on incoming edges
   */
  private getNodeInput(node: WorkflowNode): ExecutionItem[] | undefined {
    // Find incoming edge
    const incomingEdge = this.blueprint.edges.find((edge) => edge.to === node.ref);

    if (incomingEdge) {
      // Always use previous node's output items as input
      return this.execution.nodeOutputs[incomingEdge.from];
    }

    // No incoming edge (e.g., start node)
    return undefined;
  }

  /**
   * Execute a single node with template resolution and transforms
   */
  private async executeNode(node: WorkflowNode, inputItems?: ExecutionItem[]): Promise<ExecutionItem[]> {
    this.emitEvent('node_started');

    try {
      // Step 1: Resolve template expressions in parameters with input data
      const inputData = NodeHelpers.getSingleInput(inputItems);
      const resolvedParams = (await this.eval.resolveTemplates(node.parameters, this.execution, inputData)) as NodeParameters;

      // Step 2: Create handler instance with resolved parameters
      const handler = await this.createHandler(node, resolvedParams);

      // Step 3: Execute the node with input items
      const outputItems = await handler.execute(inputItems);

      // Step 4: Handle transforms and mutations based on node type
      const nodeParams = node.parameters as { transforms?: TransformOperation[]; mutations?: TransformOperation[]; condition?: string };

      // Handle transforms for input->output transformations
      if (nodeParams.transforms) {
        if (node.type === 'transform') {
          // Transform node - transforms already applied in handler execution above
          // No additional processing needed
        } else {
          // Non-transform node with transforms - spawn Transform node dynamically for input->output transformations
          await this.executeInlineTransform(nodeParams.transforms, inputItems);
        }
      }

      // Handle mutations for state mutations
      if (nodeParams.mutations) {
        if (node.type === 'mutate') {
          // Mutate node - mutations already applied in handler execution above
          // No additional processing needed
        } else {
          // Non-mutate node with mutations - spawn Mutate node dynamically for state mutations
          await this.executeInlineMutate(nodeParams.mutations);
        }
      }

      // Step 5: Handle inline condition evaluation
      if (nodeParams.condition) {
        if (node.type === 'conditional') {
          // Conditional node - condition already evaluated in handler execution above
          // No additional processing needed
        } else {
          // Non-conditional node with condition - spawn Conditional node dynamically
          const conditionResult = await this.executeInlineConditional(nodeParams.condition);
          // Store condition result in the node output items for getNextNode to use
          return outputItems.map((item) => ({
            ...item,
            json:
              typeof item.json === 'object'
                ? { ...(item.json as Record<string, unknown>), condition: conditionResult }
                : { condition: conditionResult },
          }));
        }
      }

      this.emitEvent('node_completed');
      return outputItems;
    } catch (error) {
      this.emitEvent('node_failed');
      throw error;
    }
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
      // Get the last execution output to check for conditional result
      const lastOutputItems = this.execution.nodeOutputs[this.execution.currentNodeRef!];
      let edgeCondition: string | undefined;

      // Check if last output was from a conditional node
      if (lastOutputItems && lastOutputItems.length > 0) {
        const firstItem = lastOutputItems[0];
        if (firstItem.json && typeof firstItem.json === 'object') {
          const conditionalResult = firstItem.json as Record<string, unknown>;
          if (conditionalResult.condition !== undefined) {
            edgeCondition = String(conditionalResult.condition);
          }
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
      const templateValidation = this.eval.validateTemplateExpressions(node.parameters);
      if (!templateValidation.valid) {
        const errorMessages = templateValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
        validationErrors.push(...errorMessages);
      }

      // Validate transform and mutation expressions if present
      const nodeParams = node.parameters as { transforms?: TransformOperation[]; mutations?: TransformOperation[]; condition?: string };

      // Validate transforms for input->output transformations
      if (nodeParams.transforms) {
        const virtualTransformNode: WorkflowNode = {
          type: 'transform',
          ref: 'validation_transform',
          name: 'Validation Transform',
          description: 'Temporary transform node for validation',
          parameters: { transforms: nodeParams.transforms },
        };

        const transformHandler = await this.createHandler(virtualTransformNode, { transforms: nodeParams.transforms });
        const transformValidation = transformHandler.validate();
        if (!transformValidation.valid) {
          const errorMessages = transformValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
          validationErrors.push(...errorMessages);
        }
      }

      // Validate mutations for state mutations
      if (nodeParams.mutations) {
        const virtualMutateNode: WorkflowNode = {
          type: 'mutate',
          ref: 'validation_mutate',
          name: 'Validation Mutate',
          description: 'Temporary mutate node for validation',
          parameters: { mutations: nodeParams.mutations },
        };

        const mutateHandler = await this.createHandler(virtualMutateNode, { mutations: nodeParams.mutations });
        const mutateValidation = mutateHandler.validate();
        if (!mutateValidation.valid) {
          const errorMessages = mutateValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
          validationErrors.push(...errorMessages);
        }
      }

      // Validate condition expression if present
      if (nodeParams.condition) {
        // Create a temporary Conditional node to validate condition
        const virtualConditionalNode: WorkflowNode = {
          type: 'conditional',
          ref: 'validation_conditional',
          name: 'Validation Conditional',
          description: 'Temporary conditional node for validation',
          parameters: { condition: nodeParams.condition },
        };

        const conditionalHandler = await this.createHandler(virtualConditionalNode, { condition: nodeParams.condition });
        const conditionValidation = conditionalHandler.validate();
        if (!conditionValidation.valid) {
          const errorMessages = conditionValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
          validationErrors.push(...errorMessages);
        }
      }
    }

    if (unsupportedNodes.length > 0) {
      throw new Error(`Unsupported node types: ${unsupportedNodes.map((n) => n.type).join(', ')}`);
    }

    if (validationErrors.length > 0) {
      throw new Error(`Template/Transform/Mutate validation failed:\n${validationErrors.join('\n')}`);
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
   * Execute inline transform operations by creating a virtual Transform node
   */
  private async executeInlineTransform(transforms: TransformOperation[], inputItems?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Create virtual Transform node and execute it for input->output transformations
    const virtualTransformNode: WorkflowNode = {
      type: 'transform',
      ref: 'inline_transform',
      name: 'Inline Transform',
      description: 'Auto-generated transform node for inline input->output transformations',
      parameters: { transforms },
    };

    const transformHandler = await this.createHandler(virtualTransformNode, { transforms });
    return await transformHandler.execute(inputItems);
  }

  /**
   * Execute inline mutate operations by creating a virtual Mutate node
   */
  private async executeInlineMutate(transforms: TransformOperation[]): Promise<void> {
    // Create virtual Mutate node and execute it for state mutations
    const virtualMutateNode: WorkflowNode = {
      type: 'mutate',
      ref: 'inline_mutate',
      name: 'Inline Mutate',
      description: 'Auto-generated mutate node for inline state mutations',
      parameters: { mutations: transforms },
    };

    const mutateHandler = await this.createHandler(virtualMutateNode, { mutations: transforms });
    await mutateHandler.execute();
  }

  /**
   * Execute inline condition evaluation by creating a virtual Conditional node
   */
  private async executeInlineConditional(conditionExpression: string): Promise<string | boolean | number | null | undefined> {
    // Create virtual Conditional node and execute it
    const virtualConditionalNode: WorkflowNode = {
      type: 'conditional',
      ref: 'inline_conditional',
      name: 'Inline Conditional',
      description: 'Auto-generated conditional node for inline condition evaluation',
      parameters: { condition: conditionExpression },
    };

    const conditionalHandler = await this.createHandler(virtualConditionalNode, { condition: conditionExpression });
    const conditionalResultItems = await conditionalHandler.execute();

    // Extract condition value from the conditional result items
    const firstItem = conditionalResultItems[0];
    if (firstItem?.json && typeof firstItem.json === 'object') {
      const result = firstItem.json as { condition: string | boolean | number | null | undefined };
      return result.condition;
    }
    return undefined;
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
