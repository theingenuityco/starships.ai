/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Memory-first architecture with AgentMemory system.
 */

import { Blueprint, Node, Edge, Execution, AgentNodeParameters } from '@/types';
import { Engine } from '@/engine/Engine';
import { AgentMemory, AgentMemoryState } from '@/AgentMemory';

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
  addToMemory(
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, unknown>
  ): void {
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
   * Execute the agent (delegates to internal Engine using the blueprint)
   */
  async execute(initialExecution?: Execution): Promise<Execution> {
    const executionWithMemory: Execution = {
      currentNodeRef: undefined,
      status: 'not_started',
      executionResults: new Map(),
      agentMemory: this.memory,
      ...initialExecution,
    };
    return this.engine.execute(this.params.blueprint, executionWithMemory);
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
        errors.push(
          `Unsupported node types in agent blueprint: ${unsupportedNodes.map((n) => n.type).join(', ')}`
        );
      }

      // Check edge references
      const nodeRefs = new Set(nodes.map((n) => n.ref));
      const invalidEdges = edges.filter(
        (edge) => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to)
      );
      if (invalidEdges.length > 0) {
        errors.push(
          `Invalid edge references found in agent blueprint: ${invalidEdges.length} edges`
        );
      }
    }

    // Validate timeout if provided
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push('Agent timeout should be at least 1000ms');
    }

    // Validate temperature if provided
    if (
      this.params.temperature !== undefined &&
      (this.params.temperature < 0 || this.params.temperature > 2)
    ) {
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
}
