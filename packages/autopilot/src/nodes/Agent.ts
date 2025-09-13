/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Memory-first architecture with AgentMemory system.
 */

import { AgentMemory } from '@/memory/AgentMemory';
import { Engine } from '@/engine/Engine';
import { AgentParams, NodeResult, ValidationResult, ValidationError } from '@/types';
import { EventCallback } from '@/types/events';
import { NodeHandler } from '@/types/node-handler';

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
    await this.engine.execute();
    return this.engine.getExecution().results;
  }

  /**
   * Validate agent structure and configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Check required agent fields
    if (!this.params.name) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent name is required',
      });
    }

    if (!this.params.model) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent model is required',
      });
    }

    // Check memory is present and valid
    if (!this.params.memoryState) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent memory is required',
      });
    } else if (!this.memory || typeof this.memory.toMessages !== 'function') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Invalid agent memory instance',
      });
    }

    // Check blueprint structure
    if (!this.params.blueprint) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent blueprint is required',
      });
    } else {
      const nodes = this.params.blueprint.nodes || [];
      const edges = this.params.blueprint.edges || [];

      // Check for start node
      const hasStartNode = nodes.some((node) => node.type === 'start');
      if (!hasStartNode) {
        errors.push({
          code: 'MISSING_START_NODE',
          message: 'Agent blueprint must have a start node',
        });
      }

      // Check that all node types have handlers (delegate to engine)
      const unsupportedNodes = nodes.filter((node) => !this.engine.hasHandler(node.type));
      if (unsupportedNodes.length > 0) {
        errors.push({
          code: 'INVALID_NODE_TYPE',
          message: `Unsupported node types in agent blueprint: ${unsupportedNodes.map((n) => n.type).join(', ')}`,
          details: { unsupportedNodes: unsupportedNodes.map((n) => ({ type: n.type, ref: n.ref })) },
        });
      }

      // Check edge references
      const nodeRefs = new Set(nodes.map((n) => n.ref));
      const invalidEdges = edges.filter((edge) => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to));
      if (invalidEdges.length > 0) {
        errors.push({
          code: 'INVALID_EDGE_CONNECTION',
          message: `Invalid edge references found in agent blueprint: ${invalidEdges.length} edges`,
          details: { invalidEdges: invalidEdges.map((e) => ({ from: e.from, to: e.to, ref: e.ref })) },
        });
      }
    }

    // Validate timeout if provided
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Agent timeout should be at least 1000ms',
        details: { timeout: this.params.timeout },
      });
    }

    // Validate temperature if provided
    if (this.params.temperature !== undefined && (this.params.temperature < 0 || this.params.temperature > 2)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Agent temperature should be between 0 and 2',
        details: { temperature: this.params.temperature },
      });
    }

    // Validate maxTokens if provided
    if (this.params.maxTokens !== undefined && this.params.maxTokens < 1) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Agent maxTokens should be at least 1',
        details: { maxTokens: this.params.maxTokens },
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
