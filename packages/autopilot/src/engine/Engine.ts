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
import type { Runner } from '@/runner/Runner';
import { Eval } from './Eval';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { config } from '@/constants';

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
  tool: () => import('@/nodes/Tool').then((m) => m.Tool as NodeHandlerConstructor),
  code: () => import('@/nodes/Code').then((m) => m.Code as NodeHandlerConstructor),
};

export interface EngineConfig {
  eventCallback?: EventCallback;
  failOnNodeError?: boolean;
  runner?: Runner;
  secureEnv?: Record<string, string>;
}

export class Engine {
  private eventCallback?: EventCallback;
  private eval: Eval;
  private failOnNodeError: boolean;
  private secureEnv?: Record<string, string>;

  constructor(config: EngineConfig = {}) {
    this.eventCallback = config.eventCallback;
    this.failOnNodeError = config.failOnNodeError ?? true;
    this.secureEnv = config.secureEnv;
    this.eval = new Eval(this.secureEnv);
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
      secureEnv: this.secureEnv,
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
    const dummyExecution = ExecutionItemUtils.createExecution();
    return await this.createHandler(virtualNode, parameters, dummyExecution);
  }

  private async executeInlineTransform(
    transforms: TransformOperation[],
    execution: Execution,
    inputItems?: ExecutionItem[]
  ): Promise<ExecutionItem[]> {
    // Resolve templates at execution time using the current state and the node's output as input
    const resolved = (await this.eval.resolveTemplates(
      { transforms },
      execution,
      inputItems ? ExecutionItemUtils.unwrapSingle(inputItems) : undefined,
      { stringEvaluationMode: 'full-only' }
    )) as { transforms: TransformOperation[] };

    const virtualNode = this.createVirtualNode('transform', `inline_transform`, resolved);
    const transformHandler = await this.createHandler(virtualNode, resolved, execution);
    const items = await transformHandler.execute(inputItems);
    // Record inline transform result like a normal node
    execution.results.push({ nodeRef: virtualNode.ref, items });
    return items;
  }

  private async executeInlineMutate(transforms: TransformOperation[], execution: Execution): Promise<ExecutionItem[]> {
    // Resolve templates at execution time using the current state
    const resolved = (await this.eval.resolveTemplates({ mutations: transforms }, execution, undefined, {
      stringEvaluationMode: 'full-only',
    })) as { mutations: TransformOperation[] };

    const params = { mutations: resolved.mutations };
    const virtualNode = this.createVirtualNode('mutate', `inline_mutate`, params);
    const handler = await this.createHandler(virtualNode, params, execution);
    const items = await handler.execute();
    // Record inline mutate result like a normal node
    execution.results.push({ nodeRef: virtualNode.ref, items });
    return items;
  }

  private async executeInlineConditional(conditionExpression: string, execution: Execution): Promise<string> {
    // Resolve the condition expression at execution time
    const resolved = (await this.eval.resolveTemplates({ condition: conditionExpression }, execution, undefined, {
      stringEvaluationMode: 'full-only',
    })) as { condition?: string };
    const params = { condition: resolved.condition ?? conditionExpression };

    const virtualNode = this.createVirtualNode('conditional', `inline_conditional`, params);
    const conditionalHandler = await this.createHandler(virtualNode, params, execution);
    const conditionalResultItems = await conditionalHandler.execute();
    // Record inline conditional result like a normal node
    execution.results.push({ nodeRef: virtualNode.ref, items: conditionalResultItems });

    const firstItem = conditionalResultItems[0];
    if (firstItem?.json && typeof firstItem.json === 'object') {
      const result = firstItem.json as { edgeCondition: string };
      return result.edgeCondition;
    }
    return 'null';
  }

  private async validateInlineOperations(node: Node, validationErrors: string[]): Promise<void> {
    const raw = node?.parameters;
    const nodeParams =
      raw && typeof raw === 'object'
        ? (raw as { transforms?: TransformOperation[]; mutations?: TransformOperation[]; condition?: string })
        : ({} as { transforms?: TransformOperation[]; mutations?: TransformOperation[]; condition?: string });

    if (Array.isArray(nodeParams.transforms) && nodeParams.transforms.length) {
      const transformHandler = await this.createVirtualHandler('transform', { transforms: nodeParams.transforms });
      const transformValidation = transformHandler.validate();
      if (!transformValidation.valid) {
        const errorMessages = transformValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
        validationErrors.push(...errorMessages);
      }
    }

    if (Array.isArray(nodeParams.mutations) && nodeParams.mutations.length) {
      const mutateHandler = await this.createVirtualHandler('mutate', { mutations: nodeParams.mutations });
      const mutateValidation = mutateHandler.validate();
      if (!mutateValidation.valid) {
        const errorMessages = mutateValidation.errors?.map((e) => `${node.ref}: ${e.message}`) || [];
        validationErrors.push(...errorMessages);
      }
    }

    if (typeof nodeParams.condition === 'string' && nodeParams.condition.length > 0) {
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

    // Initialize visit counter
    if (!execution.visitCounts) {
      execution.visitCounts = {};
    }

    while (currentNode && execution.status === 'running') {
      // Count visits and check limit for cycle support
      const visits = (execution.visitCounts[currentNode.ref] || 0) + 1;
      execution.visitCounts[currentNode.ref] = visits;

      if (visits > config.MAX_NODE_VISITS) {
        execution.status = 'completed';
        await this.emitEvent('workflow_completed', execution);
        return [];
      }

      try {
        const incomingEdge = blueprint.edges.find((edge) => edge.to === currentNode!.ref);
        execution.currentNodeInputRef = incomingEdge?.from;

        await this.executeNode(currentNode, execution);
        const nextNode = this.getNextNode(blueprint, execution);

        if (!nextNode) {
          execution.currentNodeRef = undefined;
          if (execution.status === 'running') {
            execution.status = 'completed';
            await this.emitEvent('workflow_completed', execution);
          }
          // If End node provided a final result, return it; otherwise return full execution results
          {
            const maybeFinal = this.extractEndOutputIfAny(blueprint, execution, currentNode);
            if (maybeFinal) {
              return maybeFinal;
            }
          }
          return ExecutionItemUtils.wrapSingle(execution.results);
        }

        currentNode = nextNode;
      } catch (error) {
        await this.handleNodeError(error, currentNode, execution);

        // If failOnNodeError is true, stop execution by throwing the error
        if (this.failOnNodeError) {
          throw error;
        }

        // Otherwise continue to next node despite the failure
        // Reset execution status back to running to continue workflow
        execution.status = 'running';

        const nextNode = this.getNextNode(blueprint, execution);
        if (!nextNode) {
          execution.currentNodeRef = undefined;
          // If we've reached the end, complete the workflow even though we had failures
          execution.status = 'completed';
          await this.emitEvent('workflow_completed', execution);
          // If End node provided a final result, return it; otherwise return full execution results
          {
            const maybeFinal = this.extractEndOutputIfAny(blueprint, execution, currentNode);
            if (maybeFinal) {
              return maybeFinal;
            }
          }
          return ExecutionItemUtils.wrapSingle(execution.results);
        }
        currentNode = nextNode;
      }
    }

    execution.currentNodeRef = undefined;
    // If End node provided a final result, return it; otherwise return full execution results
    {
      const maybeFinal = this.extractEndOutputIfAny(blueprint, execution);
      if (maybeFinal) {
        return maybeFinal;
      }
    }
    return ExecutionItemUtils.wrapSingle(execution.results);
  }

  private async handleNodeError(error: unknown, currentNode: Node, execution: Execution): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Node execution failed';
    execution.results.push({ nodeRef: currentNode.ref, items: ExecutionItemUtils.wrapError(errorMessage) });
    // Only mark the whole workflow as failed and emit workflow_failed when configured to fail on node errors.
    if (this.failOnNodeError) {
      await this.setExecutionError(execution, errorMessage);
      await this.emitEvent('workflow_failed', execution);
    }
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
    if (!execution.currentNodeInputRef) return undefined;

    // Find latest result for the input node (reverse search for efficiency)
    for (let i = execution.results.length - 1; i >= 0; i--) {
      if (execution.results[i].nodeRef === execution.currentNodeInputRef) {
        return execution.results[i].items;
      }
    }
    return undefined;
  }

  private findNodeResult(execution: Execution, nodeRef: string): ExecutionItem[] | undefined {
    // Find latest result for the specified node (reverse search for efficiency)
    for (let i = execution.results.length - 1; i >= 0; i--) {
      if (execution.results[i].nodeRef === nodeRef) {
        return execution.results[i].items;
      }
    }
    return undefined;
  }

  async executeNode(currentNode: Node, execution: Execution): Promise<ExecutionItem[]> {
    execution.currentNodeRef = currentNode.ref;
    await this.emitEvent('node_started', execution);

    try {
      // Get input items for current node
      const initialInputItems = this.findNodeResult(execution, '__initial__');
      const nodeInputItems = currentNode.type === 'start' && initialInputItems ? initialInputItems : this.getNodeInput(execution);

      // Resolve node parameters with templates (exclude inline fields until after execution)
      const inputData = ExecutionItemUtils.unwrapSingle(nodeInputItems);

      let resolvedParams: NodeParameters;
      const rawParams = (currentNode.parameters || {}) as Record<string, unknown>;

      if (currentNode.type === 'transform' || currentNode.type === 'mutate' || currentNode.type === 'conditional') {
        // Dedicated nodes: resolve everything up front
        resolvedParams = (await this.eval.resolveTemplates(rawParams, execution, inputData, {
          stringEvaluationMode: 'full-only',
        })) as NodeParameters;
      } else {
        // Non-inline nodes: resolve only handler params, defer inline fields to post-execution helpers
        const handlerParams = { ...rawParams } as Record<string, unknown>;
        delete (handlerParams as Record<string, unknown>).transforms;
        delete (handlerParams as Record<string, unknown>).mutations;
        delete (handlerParams as Record<string, unknown>).condition;
        resolvedParams = (await this.eval.resolveTemplates(handlerParams, execution, inputData, {
          stringEvaluationMode: 'full-only',
        })) as NodeParameters;
      }

      // Create and validate handler
      const handler = await this.createHandler(currentNode, resolvedParams, execution);
      const validation = handler.validate();
      if (!validation.valid) {
        const errorMessages = validation.errors?.map((e) => `${currentNode.ref}: ${e.message}`) || ['Validation failed'];
        throw new Error(`Node validation failed:\n${errorMessages.join('\n')}`);
      }

      // Process inline operations (use RAW inline params from the node definition to ensure templates are resolved at execution time)
      const inlineParams =
        currentNode.parameters && typeof currentNode.parameters === 'object'
          ? (currentNode.parameters as {
              transforms?: TransformOperation[];
              mutations?: TransformOperation[];
              condition?: string;
            })
          : undefined;
      let processedInputItems = nodeInputItems;

      // Execute the handler first (inline transforms will run after on the output)
      let outputItems = await handler.execute(processedInputItems);

      // Record primary node output immediately (as a normal node result)
      execution.results.push({ nodeRef: currentNode.ref, items: outputItems });

      // Execute inline transforms AFTER handler if present, transforming the node output.
      // IMPORTANT: Skip when the current node IS the dedicated transform node to avoid double-processing.
      if (inlineParams?.transforms?.length && currentNode.type !== 'transform') {
        outputItems = await this.executeInlineTransform(inlineParams.transforms, execution, outputItems);
      }

      // Execute inline mutations if present (mutations can use lastOutputOf/current state).
      // IMPORTANT: Skip when the current node IS the dedicated mutate node to avoid double-processing.
      if (inlineParams?.mutations?.length && currentNode.type !== 'mutate') {
        await this.executeInlineMutate(inlineParams.mutations, execution);
        // Mutations modify state; keep primary output as-is unless you intend otherwise
        // Optionally, could attach mutate result to primary result if desired
      }

      // Execute inline conditional if present.
      // IMPORTANT: Skip when the current node IS the dedicated conditional node to avoid conflicting edgeCondition.
      if (inlineParams?.condition && currentNode.type !== 'conditional') {
        const conditionResult = await this.executeInlineConditional(inlineParams.condition, execution);
        const firstItem = outputItems[0];
        if (!firstItem?.json || typeof firstItem.json !== 'object' || !('edgeCondition' in firstItem.json)) {
          outputItems = ExecutionItemUtils.wrapSingle({ edgeCondition: conditionResult });
        }
      }

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

    // Determine edge condition:
    // Prefer any inline result emitted after the current node that carries edgeCondition.
    // Scan backwards until we reach the current node's primary result.
    let edgeCondition: string | undefined;
    for (let i = execution.results.length - 1; i >= 0; i--) {
      const entry = execution.results[i];
      if (entry.nodeRef === execution.currentNodeRef) {
        break; // stop at the current node's primary result
      }
      const item = entry.items?.[0];
      if (item?.json && typeof item.json === 'object' && 'edgeCondition' in (item.json as Record<string, unknown>)) {
        edgeCondition = (item.json as Record<string, unknown>).edgeCondition as string;
        break;
      }
    }

    // Fallback to primary node output if inline didn't provide edgeCondition
    if (edgeCondition === undefined) {
      const lastOutputItems = this.findNodeResult(execution, execution.currentNodeRef!);
      if (lastOutputItems?.length) {
        const firstItem = lastOutputItems[0];
        if (firstItem.json && typeof firstItem.json === 'object') {
          const conditionalResult = firstItem.json as Record<string, unknown>;
          if (conditionalResult.edgeCondition !== undefined) {
            edgeCondition = conditionalResult.edgeCondition as string;
          }
        }
      }
    }

    // Find matching edge
    let targetEdge;
    if (edgeCondition !== undefined) {
      targetEdge = outgoingEdges.find(
        (edge) =>
          edge.condition === edgeCondition ||
          (edge.condition === 'true' && edgeCondition === 'true') ||
          (edge.condition === 'false' && edgeCondition === 'false')
      );
    }

    // Improved fallback:
    // - Prefer explicit 'false' edge when no match
    // - Then prefer an unconditional edge (no condition)
    // - Otherwise, stop (return null) rather than selecting an arbitrary first edge
    if (!targetEdge) {
      const falseEdge = outgoingEdges.find((edge) => edge.condition === 'false');
      const defaultEdge = outgoingEdges.find((edge) => !edge.condition);
      targetEdge = falseEdge ?? defaultEdge ?? undefined;
    }

    if (!targetEdge) {
      return null;
    }

    return blueprint.nodes.find((node) => node.ref === targetEdge.to) || null;
  }

  // Extract final output from End node (if its handler produced a result)
  private extractEndOutputIfAny(blueprint: Blueprint, execution: Execution, currentNode?: Node): ExecutionItem[] | null {
    const endNode = currentNode?.type === 'end' ? currentNode : blueprint.nodes.find((n) => n.type === 'end') || null;
    if (!endNode) return null;

    const items = this.findNodeResult(execution, endNode.ref);
    const firstJson = items?.[0]?.json;

    if (firstJson && typeof firstJson === 'object' && 'result' in (firstJson as Record<string, unknown>)) {
      const final = (firstJson as Record<string, unknown>).result;
      return ExecutionItemUtils.wrapSingle(final);
    }

    return null;
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
        executionDepth: execution.depth ?? 0,
        data: { execution },
      };
      // Redact any secureEnv values from outgoing events/logs by default
      const redacted = this.redactSensitive(event);
      await this.eventCallback(redacted);
    } catch (error) {
      console.error('Error in external streaming emitter:', error);
    }
  }

  private redactSensitive<T = unknown>(payload: T): T {
    try {
      const secretValues = Object.values(this.secureEnv ?? {}).filter((v) => typeof v === 'string' && v.length > 0) as string[];
      if (secretValues.length === 0) return payload;

      let json = JSON.stringify(payload);
      for (const value of secretValues) {
        // Replace all occurrences; keep it simple for now
        try {
          const safe = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          json = json.replace(new RegExp(safe, 'g'), '[REDACTED]');
        } catch {
          json = json.split(value).join('[REDACTED]');
        }
      }
      return JSON.parse(json) as T;
    } catch {
      return payload;
    }
  }
}
