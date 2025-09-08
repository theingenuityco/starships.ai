/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Memory-first architecture with AgentMemory system.
 */

import { AgentMemory, AgentMemoryState } from '@/AgentMemory';
import { Engine, EventCallback } from '@/engine/Engine';
import { streamingAdapter } from '@/streaming/StreamingAdapter';
import { AgentNodeParameters, Blueprint, Edge, Execution, Node } from '@/types';
import type { StreamingCallback, StreamingOptions } from '@/types/streaming';

export class Agent {
  private params: AgentNodeParameters;
  private memory: AgentMemory;
  private engine: Engine;

  constructor(params: AgentNodeParameters) {
    // Store agent parameters
    this.params = {
      ...params,
      // Ensure blueprint has a deep copy to avoid mutations
      blueprint: {
        ...params.blueprint,
        nodes: (params.blueprint.nodes || []).map((node) => ({ ...node })),
        edges: (params.blueprint.edges || []).map((edge) => ({ ...edge })),
        metadata: { ...params.blueprint.metadata },
      },
    };

    // Create AgentMemory instance from config
    this.memory = new AgentMemory({ state: params.memory });

    // Create engine - handles all node types internally
    this.engine = new Engine();
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.params.name;
  }

  /**
   * Get agent model
   */
  getModel(): string {
    return this.params.model;
  }

  /**
   * Get agent memory
   */
  getMemory(): AgentMemory {
    return this.memory;
  }

  /**
   * Add content to agent memory
   */
  addToMemory(role: 'user' | 'assistant', content: string, metadata?: Record<string, unknown>): void {
    this.memory.addConversation(role, content, metadata);
  }

  /**
   * Get agent description
   */
  getDescription(): string | undefined {
    return this.params.description;
  }

  /**
   * Get agent parameters (read-only copy)
   */
  getParameters(): AgentNodeParameters {
    return JSON.parse(JSON.stringify(this.params));
  }

  /**
   * Get agent timeout
   */
  getTimeout(): number | undefined {
    return this.params.timeout;
  }

  /**
   * Get agent blueprint (read-only copy)
   */
  getBlueprint(): Blueprint {
    return JSON.parse(JSON.stringify(this.params.blueprint));
  }

  /**
   * Get agent nodes
   */
  getNodes(): Node[] {
    return [...(this.params.blueprint.nodes || [])];
  }

  /**
   * Get agent edges
   */
  getEdges(): Edge[] {
    return [...(this.params.blueprint.edges || [])];
  }

  /**
   * Execute the agent with optional event monitoring and streaming support
   */
  async execute(initialExecution?: Execution, eventCallback?: EventCallback): Promise<Execution> {
    try {
      console.log(
        `Executing Agent: ${this.params.name} (${this.params.model})${initialExecution?.streaming?.enabled ? ' (streaming)' : ''}`
      );

      // Check if streaming is enabled and supported
      const isStreamingEnabled = initialExecution?.streaming?.enabled && streamingAdapter.isStreamingEnabled();

      if (isStreamingEnabled) {
        return await this.executeWithStreaming(initialExecution, eventCallback);
      } else {
        return await this.executeWithoutStreaming(initialExecution, eventCallback);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Emit streaming error if streaming is enabled
      if (initialExecution?.streaming?.enabled) {
        await streamingAdapter.emitError({
          code: 'AGENT_EXECUTION_ERROR',
          message: errorMessage,
          recoverable: false,
          context: {
            agentName: this.params.name,
            model: this.params.model,
          },
        });
      }

      throw new Error(`Agent execution failed: ${errorMessage}`);
    }
  }

  /**
   * Execute agent with streaming support
   */
  private async executeWithStreaming(initialExecution?: Execution, eventCallback?: EventCallback): Promise<Execution> {
    const executionWithMemory: Execution = {
      currentNodeRef: undefined,
      status: 'not_started',
      executionResults: new Map(),
      agentMemory: this.memory,
      ...initialExecution,
      streaming: initialExecution?.streaming,
    };

    const streamingOptions = initialExecution?.streaming;

    // Configure streaming adapter
    streamingAdapter.configure({
      enabled: true,
      streamId: streamingOptions?.streamId,
      conversationId: streamingOptions?.conversationId,
      agentId: streamingOptions?.agentId || this.params.name,
    });

    // Emit thinking chunk at start of agent execution
    await streamingAdapter.emitChunk({
      type: 'thinking',
      content: `Starting agent execution: ${this.params.name}`,
      metadata: {
        model: this.params.model,
        agentName: this.params.name,
      },
    });

    // Create streaming event callback to bridge engine events to streaming
    const streamingEventCallback: EventCallback = async (event) => {
      if (streamingAdapter.isStreamingEnabled()) {
        switch (event.type) {
          case 'node_started':
            await streamingAdapter.emitChunk({
              type: 'node_start',
              content: `Starting node execution`,
              metadata: {
                nodeRef: event.execution.currentNodeRef,
                agentName: this.params.name,
              },
            });
            break;

          case 'node_completed':
            await streamingAdapter.emitChunk({
              type: 'node_complete',
              content: `Node execution completed`,
              metadata: {
                nodeRef: event.execution.currentNodeRef,
                agentName: this.params.name,
              },
            });
            break;

          case 'workflow_completed':
            await streamingAdapter.emitComplete({
              agentName: this.params.name,
              status: 'completed',
            });
            break;

          case 'workflow_failed':
            await streamingAdapter.emitError({
              code: 'AGENT_EXECUTION_FAILED',
              message: `Agent execution failed: ${event.execution.error?.message || 'Unknown error'}`,
              recoverable: false,
              context: {
                agentName: this.params.name,
                nodeRef: event.execution.currentNodeRef,
              },
            });
            break;
        }
      }

      // Call original event callback if provided
      if (eventCallback) {
        await eventCallback(event);
      }
    };

    // Register streaming event callback
    this.onEvent(streamingEventCallback);

    try {
      const result = await this.engine.execute(this.params.blueprint, executionWithMemory);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed';
      throw new Error(`Agent streaming execution failed: ${errorMessage}`);
    } finally {
      // Clean up event callbacks
      this.offEvent(streamingEventCallback);
      if (eventCallback) {
        this.offEvent(eventCallback);
      }
    }
  }

  /**
   * Execute agent without streaming (original logic)
   */
  private async executeWithoutStreaming(initialExecution?: Execution, eventCallback?: EventCallback): Promise<Execution> {
    const executionWithMemory: Execution = {
      currentNodeRef: undefined,
      status: 'not_started',
      executionResults: new Map(),
      agentMemory: this.memory,
      ...initialExecution,
    };

    // Register event callback if provided
    if (eventCallback) {
      this.onEvent(eventCallback);
    }

    try {
      const result = await this.engine.execute(this.params.blueprint, executionWithMemory);
      return result;
    } finally {
      // Clean up event callback
      if (eventCallback) {
        this.offEvent(eventCallback);
      }
    }
  }

  /**
   * Execute agent with streaming support (convenient method)
   */
  async executeWithStreamingOptions(
    streamingOptions: StreamingOptions,
    initialExecution?: Execution,
    eventCallback?: EventCallback
  ): Promise<Execution> {
    // Create execution with streaming options
    const executionWithStreaming: Execution = {
      currentNodeRef: undefined,
      status: 'not_started',
      executionResults: new Map(),
      agentMemory: this.memory,
      ...initialExecution,
      streaming: streamingOptions,
    };

    return this.execute(executionWithStreaming, eventCallback);
  }

  /**
   * Add streaming callback for agent execution
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
   * Validate agent structure and configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required agent fields
    if (!this.params.name) {
      errors.push('Agent name is required');
    }

    if (!this.params.model) {
      errors.push('Agent model is required');
    }

    // Check memory is present and valid
    if (!this.params.memory) {
      errors.push('Agent memory is required');
    } else if (!this.memory || typeof this.memory.toMessages !== 'function') {
      errors.push('Invalid agent memory instance');
    }

    // Check blueprint structure
    if (!this.params.blueprint) {
      errors.push('Agent blueprint is required');
    } else {
      const nodes = this.params.blueprint.nodes || [];
      const edges = this.params.blueprint.edges || [];

      // Check for start node
      const hasStartNode = nodes.some((node) => node.type === 'start');
      if (!hasStartNode) {
        errors.push('Agent blueprint must have a start node');
      }

      // Check that all node types have handlers (delegate to engine)
      const unsupportedNodes = nodes.filter((node) => !this.engine.hasHandler(node.type));
      if (unsupportedNodes.length > 0) {
        errors.push(`Unsupported node types in agent blueprint: ${unsupportedNodes.map((n) => n.type).join(', ')}`);
      }

      // Check edge references
      const nodeRefs = new Set(nodes.map((n) => n.ref));
      const invalidEdges = edges.filter((edge) => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to));
      if (invalidEdges.length > 0) {
        errors.push(`Invalid edge references found in agent blueprint: ${invalidEdges.length} edges`);
      }
    }

    // Validate timeout if provided
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push('Agent timeout should be at least 1000ms');
    }

    // Validate temperature if provided
    if (this.params.temperature !== undefined && (this.params.temperature < 0 || this.params.temperature > 2)) {
      errors.push('Agent temperature should be between 0 and 2');
    }

    // Validate maxTokens if provided
    if (this.params.maxTokens !== undefined && this.params.maxTokens < 1) {
      errors.push('Agent maxTokens should be at least 1');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clone agent with the same parameters and memory
   */
  clone(): Agent {
    // Convert current memory back to state for cloning
    const memoryState: AgentMemoryState = {
      identity: this.memory.getIdentity(),
      purpose: this.memory.getPurpose(),
      space: this.memory.getSpace(),
      messages: this.memory.getMessageHistory(),
    };

    const clonedParams: AgentNodeParameters = {
      ...this.params,
      memory: memoryState,
      blueprint: {
        ...this.params.blueprint,
        nodes: (this.params.blueprint.nodes || []).map((node) => ({ ...node })),
        edges: (this.params.blueprint.edges || []).map((edge) => ({ ...edge })),
      },
    };

    return new Agent(clonedParams);
  }

  /**
   * Update agent parameters
   */
  updateParameters(updates: Partial<AgentNodeParameters>): Agent {
    // Convert current memory back to state if not being updated
    const currentMemoryState: AgentMemoryState = {
      identity: this.memory.getIdentity(),
      purpose: this.memory.getPurpose(),
      space: this.memory.getSpace(),
      messages: this.memory.getMessageHistory(),
    };

    const updatedParams = {
      ...this.params,
      ...updates,
      // Use provided memory state or current memory state
      memory: updates.memory || currentMemoryState,
      // Preserve blueprint if not being updated
      blueprint: updates.blueprint || this.params.blueprint,
    };

    return new Agent(updatedParams);
  }

  // ============================================================================
  // EVENT HANDLING - Forward Engine Events
  // ============================================================================

  /**
   * Register a callback to receive workflow execution events
   */
  onEvent(callback: EventCallback): void {
    this.engine.onEvent(callback);
  }

  /**
   * Remove an event callback
   */
  offEvent(callback: EventCallback): void {
    this.engine.offEvent(callback);
  }
}
