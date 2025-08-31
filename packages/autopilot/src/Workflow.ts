/**
 * Workflow Class
 *
 * Executable workflow that combines Blueprint data with workflow building and execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 */

import { Blueprint, Node, Edge, Execution, WorkflowNodeParameters } from './types';
import { Engine } from './engine/Engine';
import { v4 as uuidv4 } from 'uuid';

export class Workflow {
  private blueprint: Blueprint;
  private parameters?: WorkflowNodeParameters;
  private engine: Engine;

  constructor(params?: WorkflowNodeParameters) {
    // Store parameters if provided
    this.parameters = params;
    
    // Extract blueprint or create empty one
    const blueprint: Blueprint = params?.blueprint || {
      nodes: [],
      edges: [],
      metadata: {}
    };

    // Create a deep copy to avoid mutations to the original blueprint
    this.blueprint = {
      ...blueprint,
      nodes: blueprint.nodes.map(node => ({ ...node })),
      edges: blueprint.edges.map(edge => ({ ...edge })),
      metadata: { ...blueprint.metadata }
    };

    // Create engine - handles all node types internally
    this.engine = new Engine();
  }

  /**
   * Builder method: Add a node to the workflow
   */
  addNode(nodeConfig: Omit<Node, 'ref'> & { ref?: string }): Workflow {
    const node: Node = {
      ref: nodeConfig.ref || uuidv4(),
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
      ref: uuidv4(),
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
  removeNode(nodeRef: string): Workflow {
    // Remove the node
    this.blueprint.nodes = this.blueprint.nodes.filter(node => node.ref !== nodeRef);
    
    // Remove associated edges
    this.blueprint.edges = this.blueprint.edges.filter(
      edge => edge.from !== nodeRef && edge.to !== nodeRef
    );
    
    return this;
  }

  /**
   * Builder method: Remove an edge
   */
  removeEdge(edgeRef: string): Workflow {
    this.blueprint.edges = this.blueprint.edges.filter(edge => edge.ref !== edgeRef);
    return this;
  }

  /**
   * Get the current blueprint (read-only copy)
   */
  getBlueprint(): Blueprint {
    return JSON.parse(JSON.stringify(this.blueprint));
  }

  /**
   * Get workflow parameters (read-only copy)
   */
  getParameters(): WorkflowNodeParameters | undefined {
    return this.parameters ? JSON.parse(JSON.stringify(this.parameters)) : undefined;
  }

  /**
   * Get workflow timeout
   */
  getTimeout(): number | undefined {
    return this.parameters?.timeout;
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
  async execute(initialExecution?: Execution): Promise<Execution> {
    return this.engine.execute(this.blueprint, initialExecution);
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
    const nodeRefs = new Set(this.blueprint.nodes.map(n => n.ref));
    const invalidEdges = this.blueprint.edges.filter(
      edge => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to)
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

    // If we have parameters, clone them with the new blueprint
    if (this.parameters) {
      const clonedParams: WorkflowNodeParameters = {
        ...this.parameters,
        blueprint: clonedBlueprint
      };
      return new Workflow(clonedParams);
    } else {
      // If no parameters, create minimal parameters with just blueprint
      return new Workflow({ blueprint: clonedBlueprint });
    }
  }
}