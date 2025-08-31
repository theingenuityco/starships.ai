/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 */

import { Blueprint, Node, Edge, Execution, AgentNodeParameters } from './types';
import { Engine } from './engine/Engine';

export class Agent {
  private config: AgentNodeParameters;
  private engine: Engine;

  constructor(config: AgentNodeParameters) {
    // Store agent configuration
    this.config = {
      ...config,
      // Ensure blueprint has a deep copy to avoid mutations
      blueprint: {
        ...config.blueprint,
        nodes: config.blueprint.nodes.map(node => ({ ...node })),
        edges: config.blueprint.edges.map(edge => ({ ...edge })),
        metadata: { ...config.blueprint.metadata }
      }
    };

    // Create engine - handles all node types internally
    this.engine = new Engine();
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get agent model
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Get agent system prompt
   */
  getSystemPrompt(): string | undefined {
    return this.config.systemPrompt;
  }

  /**
   * Get agent instructions
   */
  getInstructions(): string | undefined {
    return this.config.instructions;
  }

  /**
   * Get agent description
   */
  getDescription(): string | undefined {
    return this.config.description;
  }

  /**
   * Get agent configuration (read-only copy)
   */
  getConfig(): AgentNodeParameters {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Get agent blueprint (read-only copy)
   */
  getBlueprint(): Blueprint {
    return JSON.parse(JSON.stringify(this.config.blueprint));
  }

  /**
   * Get agent nodes
   */
  getNodes(): Node[] {
    return [...this.config.blueprint.nodes];
  }

  /**
   * Get agent edges
   */
  getEdges(): Edge[] {
    return [...this.config.blueprint.edges];
  }

  /**
   * Execute the agent (delegates to internal Engine using the blueprint)
   */
  async execute(initialExecution?: Execution): Promise<Execution> {
    return this.engine.execute(this.config.blueprint, initialExecution);
  }

  /**
   * Validate agent structure and configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required agent fields
    if (!this.config.name) {
      errors.push('Agent name is required');
    }

    if (!this.config.model) {
      errors.push('Agent model is required');
    }

    // Check blueprint structure
    if (!this.config.blueprint) {
      errors.push('Agent blueprint is required');
    } else {
      // Check for start node
      const hasStartNode = this.config.blueprint.nodes.some(node => node.type === 'start');
      if (!hasStartNode) {
        errors.push('Agent blueprint must have a start node');
      }

      // Check that all node types have handlers (delegate to engine)
      const unsupportedNodes = this.config.blueprint.nodes.filter(node => !this.engine.hasHandler(node.type));
      if (unsupportedNodes.length > 0) {
        errors.push(`Unsupported node types in agent blueprint: ${unsupportedNodes.map(n => n.type).join(', ')}`);
      }

      // Check edge references
      const nodeRefs = new Set(this.config.blueprint.nodes.map(n => n.ref));
      const invalidEdges = this.config.blueprint.edges.filter(
        edge => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to)
      );
      if (invalidEdges.length > 0) {
        errors.push(`Invalid edge references found in agent blueprint: ${invalidEdges.length} edges`);
      }
    }

    // Validate timeout if provided
    if (this.config.timeout !== undefined && this.config.timeout < 1000) {
      errors.push('Agent timeout should be at least 1000ms');
    }

    // Validate temperature if provided
    if (this.config.temperature !== undefined && (this.config.temperature < 0 || this.config.temperature > 2)) {
      errors.push('Agent temperature should be between 0 and 2');
    }

    // Validate maxTokens if provided
    if (this.config.maxTokens !== undefined && this.config.maxTokens < 1) {
      errors.push('Agent maxTokens should be at least 1');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Clone agent with the same configuration
   */
  clone(): Agent {
    const clonedConfig: AgentNodeParameters = {
      ...this.config,
      blueprint: {
        ...this.config.blueprint,
        nodes: this.config.blueprint.nodes.map(node => ({ ...node })),
        edges: this.config.blueprint.edges.map(edge => ({ ...edge }))
      }
    };

    return new Agent(clonedConfig);
  }

  /**
   * Update agent configuration
   */
  updateConfig(updates: Partial<AgentNodeParameters>): Agent {
    const updatedConfig = {
      ...this.config,
      ...updates,
      // Preserve blueprint if not being updated
      blueprint: updates.blueprint || this.config.blueprint
    };

    return new Agent(updatedConfig);
  }
}