/**
 * Execution Engine
 *
 * Core engine for executing graphs and nodes. Handles sequential execution,
 * state management, error recovery, and user interaction coordination.
 */

import { NodeHandler, NodeHandlerConstructor } from '@/types/node-handler';
import { Blueprint, Execution, NodeHandlerOptions, Node as Node, NodeParameters, ExecutionItem } from '@/types';
import type { EventCallback, ExecutionEvent, ExecutionEventType } from '@/types/events';
import type { TransformOperation } from '@/types/node-parameters';
import { Eval } from './Eval';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

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
  eventCallback?: EventCallback;
}

export class Engine {
  private eventCallback?: EventCallback;
  private eval: Eval;

  constructor(config: EngineConfig = {}) {
    this.eventCallback = config.eventCallback;
    this.eval = new Eval();
  }

  async createHandler(node: Node, resolvedParams: NodeParameters, execution: Execution): Promise<NodeHandler> {
    const loader = HANDLER_MAP[node.type];
    if (!loader) {
      throw new Error(`No handler available for node type: ${node.type}`);
    }

    const handlerConstructor = await loader();
    const handlerOptions = {
      eventCallback: this.eventCallback,
      execution: execution,
    } as NodeHandlerOptions;

    return new handlerConstructor(resolvedParams, handlerOptions);
  }

  hasHandler(type: string): boolean {
    return type in HANDLER_MAP;
  }

  private createVirtualNode(type: 'transform' | 'mutate' | 'conditional', ref: string, parameters: NodeParameters): Node {
    const nodeNames = {
      transform: 'Inline Transform',
      mutate: 'Inline Mutate',
      conditional: 'Inline Conditional',
    };

    const nodeDescriptions = {
      transform: 'Auto-generated transform node for inline input->output transformations',
      mutate: 'Auto-generated mutate node for inline state mutations',
      conditional: 'Auto-generated conditional node for inline condition evaluation',
    };

    return {
      type,
      ref,
      name: nodeNames[type],
      description: nodeDescriptions[type],
      parameters,
    };
  }

  private async createVirtualHandler(type: 'transform' | 'mutate' | 'conditional', parameters: NodeParameters): Promise<NodeHandler> {
    const virtualNode = this.createVirtualNode(type, `inline_${type}`, parameters);
    const dummyExecution = { status: 'not_started', nodeOutputs: {}, state: {} } as Execution;
    return await this.createHandler(virtualNode, parameters, dummyExecution);
  }

  private async executeInlineTransform(transforms: TransformOperation[], inputItems?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const transformHandler = await this.createVirtualHandler('transform', { transforms });
    return await transformHandler.execute(inputItems);
  }

  private async executeInlineMutate(transforms: TransformOperation[]): Promise<void> {
    const mutateHandler = await this.createVirtualHandler('mutate', { mutations: transforms });
    await mutateHandler.execute();
  }

  private async executeInlineConditional(conditionExpression: string): Promise<string | boolean | number | null | undefined> {
    const conditionalHandler = await this.createVirtualHandler('conditional', { condition: conditionExpression });
    const conditionalResultItems = await conditionalHandler.execute();

    const firstItem = conditionalResultItems[0];
    if (firstItem?.json && typeof firstItem.json === 'object') {
      const result = firstItem.json as { condition: string | boolean | number | null | undefined };
      return result.condition;
    }
    return undefined;
  }

  private async validateInlineOperations(node: Node, validationErrors: string[]): Promise<void> {
    const nodeParams = node.parameters as { transforms?: TransformOperation[]; mutations?: TransformOperation[]; condition?: string };

    if (nodeParams.transforms) {
      const transformHandler = await this.createVirtualHandler('transform', { transforms: nodeParams.transforms });
      const transformValidation = transformHandler.validate();
      if (!transformValidation.valid) {
        const errorMessages = transformValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
        validationErrors.push(...errorMessages);
      }
    }

    if (nodeParams.mutations) {
      const mutateHandler = await this.createVirtualHandler('mutate', { mutations: nodeParams.mutations });
      const mutateValidation = mutateHandler.validate();
      if (!mutateValidation.valid) {
        const errorMessages = mutateValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
        validationErrors.push(...errorMessages);
      }
    }

    if (nodeParams.condition) {
      const conditionalHandler = await this.createVirtualHandler('conditional', { condition: nodeParams.condition });
      const conditionValidation = conditionalHandler.validate();
      if (!conditionValidation.valid) {
        const errorMessages = conditionValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
        validationErrors.push(...errorMessages);
      }
    }
  }

  async executeBlueprint(blueprint: Blueprint, execution: Execution): Promise<ExecutionItem[]> {
    try {
      await this.validateForExecution(blueprint);
      let currentNode: Node | null;

      if (execution.currentNodeRef) {
        currentNode = blueprint.nodes.find((node) => node.ref === execution.currentNodeRef) || null;
        if (!currentNode) {
          throw new Error(`Cannot resume: current node '${execution.currentNodeRef}' not found in blueprint`);
        }
      } else {
        currentNode = this.getStartNode(blueprint);
        if (!currentNode) {
          throw new Error('No start node found in blueprint');
        }
        await this.emitEvent('workflow_started', execution);
      }

      execution.status = 'running';
      return await this.executeLoop(blueprint, execution, currentNode);
    } catch (error) {
      await this.handleExecutionError(error, execution);
      throw error;
    }
  }

  private async executeLoop(blueprint: Blueprint, execution: Execution, startNode: Node): Promise<ExecutionItem[]> {
    let currentNode: Node | null = startNode;

    while (currentNode && execution.status === 'running') {
      try {
        const incomingEdge = blueprint.edges.find((edge) => edge.to === currentNode!.ref);
        execution.currentNodeInputRef = incomingEdge?.from;

        const outputItems = await this.executeNode(currentNode, execution);
        const nextNode = this.getNextNode(blueprint, execution);

        if (!nextNode) {
          execution.currentNodeRef = undefined;
          if (execution.status === 'running') {
            execution.status = 'completed';
            await this.emitEvent('workflow_completed', execution);
          }
          return outputItems;
        }

        currentNode = nextNode;
      } catch (error) {
        await this.handleNodeError(error, currentNode, execution);
        throw error;
      }
    }

    execution.currentNodeRef = undefined;
    return [];
  }

  private async handleNodeError(error: unknown, currentNode: Node, execution: Execution): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Node execution failed';
    execution.nodeOutputs[currentNode.ref] = ExecutionItemUtils.wrapError(errorMessage);
    await this.setExecutionError(execution, errorMessage);
    await this.emitEvent('workflow_failed', execution);
  }

  private async handleExecutionError(error: unknown, execution: Execution): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await this.setExecutionError(execution, errorMessage);
    await this.emitEvent('workflow_failed', execution);
  }

  private async setExecutionError(execution: Execution, message: string): Promise<void> {
    execution.status = 'failed';
    execution.error = {
      code: 'SYSTEM_ERROR',
      message,
      timestamp: new Date().toISOString(),
      recoverable: false,
    };
  }

  private getNodeInput(execution: Execution): ExecutionItem[] | undefined {
    return execution.currentNodeInputRef ? execution.nodeOutputs[execution.currentNodeInputRef] : undefined;
  }

  async executeNode(currentNode: Node, execution: Execution): Promise<ExecutionItem[]> {
    execution.currentNodeRef = currentNode.ref;
    await this.emitEvent('node_started', execution);

    try {
      // Get input items for current node
      const initialInputItems = execution.nodeOutputs['__initial__'];
      const nodeInputItems = currentNode.type === 'start' && initialInputItems ? initialInputItems : this.getNodeInput(execution);

      // Resolve node parameters with templates
      const inputData = ExecutionItemUtils.unwrapSingle(nodeInputItems);
      const resolvedParams = (await this.eval.resolveTemplates(currentNode.parameters, execution, inputData)) as NodeParameters;

      // Create and validate handler
      const handler = await this.createHandler(currentNode, resolvedParams, execution);
      const validation = handler.validate();
      if (!validation.valid) {
        const errorMessages = validation.errors?.map((e) => `${currentNode.ref}: ${e.message}`) || ['Validation failed'];
        throw new Error(`Node validation failed:\n${errorMessages.join('\n')}`);
      }

      // Process inline operations
      const nodeParams = resolvedParams as { transforms?: TransformOperation[]; mutations?: TransformOperation[]; condition?: string };
      let processedInputItems = nodeInputItems;

      // Execute inline transforms if present
      if (nodeParams.transforms?.length) {
        processedInputItems = await this.executeInlineTransform(nodeParams.transforms, processedInputItems);
      }

      // Execute the handler with processed input items
      let outputItems = await handler.execute(processedInputItems);

      // Execute inline mutations if present
      if (nodeParams.mutations?.length) {
        await this.executeInlineMutate(nodeParams.mutations);
      }

      // Execute inline conditional if present
      if (nodeParams.condition) {
        const conditionResult = await this.executeInlineConditional(nodeParams.condition);
        const firstItem = outputItems[0];
        if (!firstItem?.json || typeof firstItem.json !== 'object' || !('condition' in firstItem.json)) {
          outputItems = ExecutionItemUtils.wrapSingle({ condition: conditionResult });
        }
      }

      execution.nodeOutputs[currentNode.ref] = outputItems;
      await this.emitEvent('node_completed', execution);
      return outputItems;
    } catch (error) {
      await this.emitEvent('node_failed', execution);
      throw error;
    }
  }

  /**
   * Find the start node in the blueprint
   */
  private getStartNode(blueprint: Blueprint): Node | null {
    return blueprint.nodes.find((node) => node.type === 'start') || null;
  }

  private getNextNode(blueprint: Blueprint, execution: Execution): Node | null {
    const outgoingEdges = blueprint.edges.filter((edge) => edge.from === execution.currentNodeRef);

    if (!outgoingEdges.length) {
      const currentNode = blueprint.nodes.find((node) => node.ref === execution.currentNodeRef);
      if (currentNode?.type !== 'end') {
        throw new Error(`Engine exited unexpectedly, at Node: ${currentNode?.ref}`);
      }
      return null;
    }

    // Extract condition from output if present
    const lastOutputItems = execution.nodeOutputs[execution.currentNodeRef!];
    let edgeCondition: string | undefined;

    if (lastOutputItems?.length) {
      const firstItem = lastOutputItems[0];
      if (firstItem.json && typeof firstItem.json === 'object') {
        const conditionalResult = firstItem.json as Record<string, unknown>;
        if (conditionalResult.condition !== undefined) {
          edgeCondition = String(conditionalResult.condition);
        }
      }
    }

    // Find matching edge
    let targetEdge;
    if (edgeCondition) {
      targetEdge = outgoingEdges.find(
        (edge) =>
          edge.condition === edgeCondition ||
          (edge.condition === 'true' && edgeCondition === 'true') ||
          (edge.condition === 'false' && edgeCondition === 'false')
      );
    }

    // Fallback to default edge
    if (!targetEdge) {
      targetEdge = outgoingEdges.find((edge) => !edge.condition) || outgoingEdges[0];
    }

    return targetEdge ? blueprint.nodes.find((node) => node.ref === targetEdge.to) || null : null;
  }

  private async validateForExecution(blueprint: Blueprint): Promise<void> {
    this.validateStartNode(blueprint);

    const unsupportedNodes: Array<{ ref: string; type: string }> = [];
    const validationErrors: string[] = [];

    for (const node of blueprint.nodes) {
      if (!this.hasHandler(node.type)) {
        unsupportedNodes.push({ ref: node.ref, type: node.type });
        continue;
      }

      this.validateTemplateExpressions(node, validationErrors);
      await this.validateInlineOperations(node, validationErrors);
    }

    this.throwValidationErrors(unsupportedNodes, validationErrors);
  }

  private validateStartNode(blueprint: Blueprint): void {
    const startNode = blueprint?.nodes?.find((node) => node.type === 'start');
    if (!startNode) {
      throw new Error('Blueprint must have a start node');
    }
  }

  private validateTemplateExpressions(node: Node, validationErrors: string[]): void {
    const templateValidation = this.eval.validateTemplateExpressions(node.parameters);
    if (!templateValidation.valid) {
      const errorMessages = templateValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
      validationErrors.push(...errorMessages);
    }
  }

  private throwValidationErrors(unsupportedNodes: Array<{ ref: string; type: string }>, validationErrors: string[]): void {
    if (unsupportedNodes.length > 0) {
      throw new Error(`Unsupported node types: ${unsupportedNodes.map((n) => n.type).join(', ')}`);
    }

    if (validationErrors.length > 0) {
      throw new Error(`Template/Transform/Mutate validation failed:\n${validationErrors.join('\n')}`);
    }
  }

  /**
   * Pause blueprint execution
   */
  pause(execution: Execution): boolean {
    if (!execution || execution.status !== 'running') return false;

    execution.status = 'paused';
    this.emitEvent('workflow_paused', execution);
    return true;
  }

  resume(execution: Execution): boolean {
    if (!execution || execution.status !== 'paused') return false;

    execution.status = 'running';
    this.emitEvent('workflow_resumed', execution);
    return true;
  }

  cancel(execution: Execution): boolean {
    if (!execution || execution.status === 'completed' || execution.status === 'failed') {
      return false;
    }

    execution.status = 'cancelled';
    return true;
  }

  private async emitEvent(type: ExecutionEventType, execution: Execution): Promise<void> {
    if (!this.eventCallback) return;

    try {
      const event: ExecutionEvent = {
        type,
        timestamp: new Date().toISOString(),
        data: { execution },
      };
      await this.eventCallback(event);
    } catch (error) {
      console.error('Error in external streaming emitter:', error);
    }
  }
}
