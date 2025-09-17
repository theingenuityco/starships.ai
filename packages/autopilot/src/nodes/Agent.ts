/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Enhanced with consistent two-word method naming for semantic grouping.
 */

import { AgentParams, ValidationResult, ValidationError, NodeHandlerOptions, NodeType, ExecutionItem } from '@/types';
import { NodeHandler } from '@/types/node-handler';
import { Blueprint } from '@/types/blueprint';
import { NodeParameters } from '@/types/node-parameters';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { Engine } from '@/engine/Engine';

export class Agent implements NodeHandler {
  private params: AgentParams;
  private options?: NodeHandlerOptions;
  private nodeCounter: number = 1;

  constructor(params: AgentParams, options?: NodeHandlerOptions) {
    // Store agent parameters
    this.params = structuredClone(params);

    // Create options
    this.options = options;

    // Initialize blueprint if not provided
    if (!this.params.blueprint) {
      const startRef = `start_${this.nodeCounter++}`;
      const endRef = `end_${this.nodeCounter++}`;

      this.params.blueprint = {
        nodes: [
          {
            ref: startRef,
            type: 'start',
            name: 'Start',
            description: 'Start node',
            parameters: {},
          },
          {
            ref: endRef,
            type: 'end',
            name: 'End',
            description: 'End node',
            parameters: {},
          },
        ],
        edges: [
          {
            ref: `edge_1`,
            from: startRef,
            to: endRef,
          },
        ],
        metadata: {
          generatedBy: 'Agent constructor',
          createdAt: new Date().toISOString(),
        },
      };
    }

    // Blueprint is guaranteed to exist after constructor logic above
  }

  // =============================================================================
  // PRIVATE HELPERS
  // =============================================================================

  /**
   * Helper method to connect new node to previous node and redirect to end node
   */
  private connectToPrevious(newNodeRef: string): void {
    const nodes = this.params.blueprint!.nodes;
    const edges = this.params.blueprint!.edges;

    // Find the end node
    const endNode = nodes.find((node) => node.type === 'end');
    if (!endNode) return;

    // Find the node that currently connects to the end node (should be the last added node)
    const edgeToEnd = edges.find((edge) => edge.to === endNode.ref);
    if (!edgeToEnd) return;

    // Update the edge to end node: redirect it to point to the new node
    edgeToEnd.to = newNodeRef;

    // Add new edge from the new node to the end node
    edges.push({
      ref: `edge_${edges.length + 1}`,
      from: newNodeRef,
      to: endNode.ref,
    });
  }

  // =============================================================================
  // NODE MANAGEMENT
  // =============================================================================

  /**
   * Add any type of node to the agent's blueprint
   */
  addNode(
    type: NodeType,
    name: string,
    parameters: NodeParameters,
    options?: {
      description?: string;
      ref?: string;
    }
  ): Agent {
    const ref = options?.ref || `${type}_${this.nodeCounter++}`;
    const description = options?.description || `${type} node: ${name}`;

    this.params.blueprint!.nodes.push({
      ref,
      type,
      name,
      description,
      parameters,
    });

    this.connectToPrevious(ref);
    return this;
  }

  /**
   * Get current blueprint
   */
  getCurrentBlueprint(): Blueprint {
    return this.params.blueprint!;
  }

  // =============================================================================
  // EXECUTION METHODS
  // =============================================================================

  /**
   * Execute the agent with optional input items
   * Creates a new Engine instance and executes the agent's blueprint
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Create a new Engine instance for executing the agent's blueprint
    const engine = new Engine({
      eventCallback: this.options?.eventCallback,
    });

    // Create execution context for the agent's blueprint
    const execution = ExecutionItemUtils.createExecution(input);

    try {
      // Execute the agent's blueprint using the new Engine
      return await engine.executeBlueprint(this.params.blueprint!, execution);
    } catch (error) {
      throw new Error(`Agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

    // Check blueprint structure (guaranteed to exist after constructor)
    // Blueprint is always present due to constructor logic, so we validate its structure
    const nodes = this.params.blueprint!.nodes || [];
    const edges = this.params.blueprint!.edges || [];

    // Check for start node
    const hasStartNode = nodes.some((node) => node.type === 'start');
    if (!hasStartNode) {
      errors.push({
        code: 'MISSING_START_NODE',
        message: 'Agent blueprint must have a start node',
      });
    }

    // Note: Node type validation will be handled by external Engine during execution

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
