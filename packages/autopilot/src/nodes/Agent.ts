/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Memory-first architecture with AgentMemory system.
 */

import { AgentMemory } from '@/AgentMemory';
import { Engine } from '@/engine/Engine';
import { AgentParams, NodeResult, ValidationResult } from '@/types';
import { EventCallback } from '@/types/emitters';
import { NodeHandler } from '@/engine/NodeHandler';

export class Agent implements NodeHandler {
  private params: AgentParams;
  private memory: AgentMemory;
  private engine: Engine;
  private eventCallback?: EventCallback;

  constructor(params: AgentParams, eventCallback: EventCallback) {
    // Store agent parameters
    this.params = structuredClone(params);

    // Create AgentMemory instance from config
    this.memory = new AgentMemory(this.params.memoryState);

    // Create engine - handles all node types internally
    this.eventCallback = eventCallback;

    const engincConfig = {
      blueprint: this.params.blueprint,
      eventCallback: this.eventCallback,
    };
    this.engine = new Engine(engincConfig);
  }

  /**
   * Execute the agent
   */
  async execute(): Promise<NodeResult[]> {
    try {
      await this.engine.execute();
      return this.engine.getExecution().results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Agent execution failed: ${errorMessage}`);
    }
  }

  /**
   * Validate agent structure and configuration
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    // Check required agent fields
    if (!this.params.name) {
      errors.push('Agent name is required');
    }

    if (!this.params.model) {
      errors.push('Agent model is required');
    }

    // Check memory is present and valid
    if (!this.params.memoryState) {
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
}
