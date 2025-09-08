/**
 * Workflow Class
 *
 * Executable workflow that combines Blueprint data with workflow building and execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 */

import { Engine } from '@/engine/Engine';
import { streamingAdapter } from '@/streaming/StreamingAdapter';
import { Blueprint, Edge, Execution, Node, WorkflowNodeParameters } from '@/types';
import type { StreamingCallback, StreamingOptions } from '@/types/streaming';
import { nanoid } from 'nanoid';

export class Workflow {
  private params: WorkflowNodeParameters;
  private engine: Engine;

  constructor(params?: WorkflowNodeParameters) {
    // Create blueprint or use provided one
    const blueprint: Blueprint = params?.blueprint || {
      nodes: [],
      edges: [],
      metadata: {},
    };

    // Create a deep copy to avoid mutations to the original blueprint
    const clonedBlueprint = {
      ...blueprint,
      nodes: blueprint.nodes.map((node) => ({ ...node })),
      edges: blueprint.edges.map((edge) => ({ ...edge })),
      metadata: { ...blueprint.metadata },
    };

    // Store parameters with cloned blueprint
    this.params = {
      ...params,
      blueprint: clonedBlueprint,
    };

    // Create engine - handles all node types internally
    this.engine = new Engine();
  }

  /**
   * Builder method: Add a node to the workflow
   */
  addNode(nodeConfig: Omit<Node, 'ref'> & { ref?: string }): Workflow {
    const node: Node = {
      ref: nodeConfig.ref || nanoid(),
      type: nodeConfig.type,
      name: nodeConfig.name,
      description: nodeConfig.description,
      parameters: nodeConfig.parameters,
      metadata: nodeConfig.metadata,
    };

    this.params.blueprint.nodes.push(node);
    return this;
  }

  /**
   * Builder method: Add an edge to the workflow
   */
  addEdge(from: string, to: string, condition?: string, label?: string): Workflow {
    const edge: Edge = {
      ref: nanoid(),
      from,
      to,
      condition,
      label,
      metadata: {},
    };

    this.params.blueprint.edges.push(edge);
    return this;
  }

  /**
   * Builder method: Remove a node and its associated edges
   */
  removeNode(nodeRef: string): Workflow {
    // Remove the node
    this.params.blueprint.nodes = this.params.blueprint.nodes.filter((node) => node.ref !== nodeRef);

    // Remove associated edges
    this.params.blueprint.edges = this.params.blueprint.edges.filter((edge) => edge.from !== nodeRef && edge.to !== nodeRef);

    return this;
  }

  /**
   * Builder method: Remove an edge
   */
  removeEdge(edgeRef: string): Workflow {
    this.params.blueprint.edges = this.params.blueprint.edges.filter((edge) => edge.ref !== edgeRef);
    return this;
  }

  /**
   * Get the current blueprint (read-only copy)
   */
  getBlueprint(): Blueprint {
    return JSON.parse(JSON.stringify(this.params.blueprint));
  }

  /**
   * Get workflow parameters (read-only copy)
   */
  getParameters(): WorkflowNodeParameters {
    return JSON.parse(JSON.stringify(this.params));
  }

  /**
   * Get workflow timeout
   */
  getTimeout(): number | undefined {
    return this.params.timeout;
  }

  /**
   * Get workflow nodes
   */
  getNodes(): Node[] {
    return [...this.params.blueprint.nodes];
  }

  /**
   * Get workflow edges
   */
  getEdges(): Edge[] {
    return [...this.params.blueprint.edges];
  }

  /**
   * Execute the workflow with streaming support
   */
  async execute(initialExecution?: Execution): Promise<Execution> {
    try {
      console.log(
        `Executing Workflow: ${this.params.blueprint.nodes.length} nodes${initialExecution?.streaming?.enabled ? ' (streaming)' : ''}`
      );

      // Check if streaming is enabled and supported
      const isStreamingEnabled = initialExecution?.streaming?.enabled && streamingAdapter.isStreamingEnabled();

      if (isStreamingEnabled) {
        return await this.executeWithStreaming(initialExecution);
      } else {
        return await this.executeWithoutStreaming(initialExecution);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Emit streaming error if streaming is enabled
      if (initialExecution?.streaming?.enabled) {
        await streamingAdapter.emitError({
          code: 'WORKFLOW_EXECUTION_ERROR',
          message: errorMessage,
          recoverable: false,
          context: {
            workflowType: 'workflow',
            nodeCount: this.params.blueprint.nodes.length,
          },
        });
      }

      throw new Error(`Workflow execution failed: ${errorMessage}`);
    }
  }

  /**
   * Execute workflow with streaming support
   */
  private async executeWithStreaming(initialExecution?: Execution): Promise<Execution> {
    // Add streaming configuration to execution
    const executionWithStreaming: Execution = {
      currentNodeRef: undefined,
      status: 'not_started',
      executionResults: new Map(),
      agentMemory: initialExecution?.agentMemory!,
      ...initialExecution,
      streaming: initialExecution?.streaming,
    };

    const streamingOptions = initialExecution?.streaming;

    // Configure streaming adapter
    streamingAdapter.configure({
      enabled: true,
      streamId: streamingOptions?.streamId,
      conversationId: streamingOptions?.conversationId,
      agentId: streamingOptions?.agentId,
    });

    // Emit workflow start event
    await streamingAdapter.emitChunk({
      type: 'node_start',
      content: 'Starting workflow execution',
      metadata: {
        workflowType: 'workflow',
        nodeCount: this.params.blueprint.nodes.length,
      },
    });

    try {
      const result = await this.engine.execute(this.params.blueprint, executionWithStreaming);

      // Emit completion
      await streamingAdapter.emitComplete({
        workflowType: 'workflow',
        status: result.status,
        nodeCount: this.params.blueprint.nodes.length,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      throw new Error(`Workflow streaming execution failed: ${errorMessage}`);
    }
  }

  /**
   * Execute workflow without streaming (original logic)
   */
  private async executeWithoutStreaming(initialExecution?: Execution): Promise<Execution> {
    // Create execution without streaming configuration
    const execution: Execution = {
      currentNodeRef: undefined,
      status: 'not_started',
      executionResults: new Map(),
      agentMemory: initialExecution?.agentMemory!,
      ...initialExecution,
    };

    // Execute workflow through engine
    return await this.engine.execute(this.params.blueprint, execution);
  }

  /**
   * Execute workflow with streaming (convenient method)
   */
  async executeWithStreamingOptions(streamingOptions: StreamingOptions, initialExecution?: Execution): Promise<Execution> {
    // Create execution with streaming options
    const executionWithStreaming: Execution = {
      currentNodeRef: undefined,
      status: 'not_started',
      executionResults: new Map(),
      agentMemory: initialExecution?.agentMemory!,
      ...initialExecution,
      streaming: streamingOptions,
    };

    return this.execute(executionWithStreaming);
  }

  /**
   * Add streaming callback for workflow execution
   */
  onStreamChunk(callback: StreamingCallback): void {
    streamingAdapter.onChunk(callback);
  }

  /**
   * Remove streaming callback
   */
  offStreamChunk(callback: StreamingCallback): void {
    streamingAdapter.offChunk(callback);
  }

  /**
   * Validate workflow structure
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for start node
    const hasStartNode = this.params.blueprint.nodes.some((node) => node.type === 'start');
    if (!hasStartNode) {
      errors.push('Workflow must have a start node');
    }

    // Check that all node types have handlers (delegate to engine)
    const unsupportedNodes = this.params.blueprint.nodes.filter((node) => !this.engine.hasHandler(node.type));
    if (unsupportedNodes.length > 0) {
      errors.push(`Unsupported node types: ${unsupportedNodes.map((n) => n.type).join(', ')}`);
    }

    // Check edge references
    const nodeRefs = new Set(this.params.blueprint.nodes.map((n) => n.ref));
    const invalidEdges = this.params.blueprint.edges.filter((edge) => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to));
    if (invalidEdges.length > 0) {
      errors.push(`Invalid edge references found: ${invalidEdges.length} edges`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clone workflow
   */
  clone(): Workflow {
    const clonedBlueprint: Blueprint = {
      ...this.params.blueprint,
      nodes: this.params.blueprint.nodes.map((node) => ({ ...node })),
      edges: this.params.blueprint.edges.map((edge) => ({ ...edge })),
    };

    const clonedParams: WorkflowNodeParameters = {
      ...this.params,
      blueprint: clonedBlueprint,
    };

    return new Workflow(clonedParams);
  }
}
