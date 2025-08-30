/**
 * Workflow Class
 *
 * Executable workflow that combines Blueprint data with workflow building and execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 */

import { Blueprint, Node, Edge, ExecutionContext, RuntimeState } from './types';
import { Engine } from './engine/Engine';
import { v4 as uuidv4 } from 'uuid';

export class Workflow {
  private blueprint: Blueprint;
  private engine: Engine;

  constructor(blueprint?: Blueprint) {
    // Initialize blueprint
    if (!blueprint) {
      this.blueprint = {
        nodes: [],
        edges: [],
        metadata: {}
      };
    } else {
      // Create a deep copy to avoid mutations to the original blueprint
      this.blueprint = {
        ...blueprint,
        nodes: blueprint.nodes.map(node => ({ ...node })),
        edges: blueprint.edges.map(edge => ({ ...edge })),
        metadata: { ...blueprint.metadata }
      };
    }

    // Create engine - handles all node types internally
    this.engine = new Engine();
  }

  /**
   * Builder method: Add a node to the workflow
   */
  addNode(nodeConfig: Omit<Node, 'id'> & { id?: string }): Workflow {
    const node: Node = {
      id: nodeConfig.id || uuidv4(),
      type: nodeConfig.type,
      name: nodeConfig.name,
      description: nodeConfig.description,
      parameters: nodeConfig.parameters,
      metadata: nodeConfig.metadata
    };

    this.blueprint.nodes.push(node);
    return this;
  }

  /**
   * Builder method: Add an edge to the workflow
   */
  addEdge(from: string, to: string, condition?: string, label?: string): Workflow {
    const edge: Edge = {
      id: uuidv4(),
      from,
      to,
      condition,
      label,
      metadata: {}
    };

    this.blueprint.edges.push(edge);
    return this;
  }

  /**
   * Builder method: Remove a node and its associated edges
   */
  removeNode(nodeId: string): Workflow {
    // Remove the node
    this.blueprint.nodes = this.blueprint.nodes.filter(node => node.id !== nodeId);
    
    // Remove associated edges
    this.blueprint.edges = this.blueprint.edges.filter(
      edge => edge.from !== nodeId && edge.to !== nodeId
    );
    
    return this;
  }

  /**
   * Builder method: Remove an edge
   */
  removeEdge(edgeId: string): Workflow {
    this.blueprint.edges = this.blueprint.edges.filter(edge => edge.id !== edgeId);
    return this;
  }

  /**
   * Get the current blueprint (read-only copy)
   */
  getBlueprint(): Blueprint {
    return JSON.parse(JSON.stringify(this.blueprint));
  }


  /**
   * Get workflow nodes
   */
  getNodes(): Node[] {
    return [...this.blueprint.nodes];
  }

  /**
   * Get workflow edges
   */
  getEdges(): Edge[] {
    return [...this.blueprint.edges];
  }

  /**
   * Execute the workflow (delegates to internal Engine)
   */
  async execute(context: Partial<ExecutionContext>): Promise<RuntimeState> {
    return this.engine.execute(this.blueprint, context);
  }

  /**
   * Validate workflow structure
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for start node
    const hasStartNode = this.blueprint.nodes.some(node => node.type === 'start');
    if (!hasStartNode) {
      errors.push('Workflow must have a start node');
    }

    // Check that all node types have handlers (delegate to engine)
    const unsupportedNodes = this.blueprint.nodes.filter(node => !this.engine.hasHandler(node.type));
    if (unsupportedNodes.length > 0) {
      errors.push(`Unsupported node types: ${unsupportedNodes.map(n => n.type).join(', ')}`);
    }

    // Check edge references
    const nodeIds = new Set(this.blueprint.nodes.map(n => n.id));
    const invalidEdges = this.blueprint.edges.filter(
      edge => !nodeIds.has(edge.from) || !nodeIds.has(edge.to)
    );
    if (invalidEdges.length > 0) {
      errors.push(`Invalid edge references found: ${invalidEdges.length} edges`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Clone workflow
   */
  clone(): Workflow {
    const clonedBlueprint: Blueprint = {
      ...this.blueprint,
      nodes: this.blueprint.nodes.map(node => ({ ...node })),
      edges: this.blueprint.edges.map(edge => ({ ...edge }))
    };

    return new Workflow(clonedBlueprint);
  }
}