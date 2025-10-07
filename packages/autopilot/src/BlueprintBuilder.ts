/**
 * BlueprintBuilder
 *
 * Type-safe builder for constructing blueprints. Accepts complete node objects
 * with compile-time type checking based on node type.
 */

import { Blueprint, Node, Edge } from '@/types';

/**
 * Node input with optional ref field
 * If ref is not provided, it will be derived from the name
 */
type NodeInput = Omit<Node, 'ref'> & { ref?: string };

export class BlueprintBuilder {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private metadata: Record<string, unknown> = {};

  /**
   * Generate a node reference from a name
   * Converts name to lowercase, replaces spaces/special chars with underscores
   */
  private generateRefFromName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  }

  /**
   * Add a node to the blueprint
   * Accepts a complete node object with full type safety
   * @param node - Complete node object. If ref is provided, it will be used; otherwise derived from name
   * @returns The node reference for use in edges
   */
  addNode(node: NodeInput): string {
    // Only generate ref if not explicitly provided by user
    const ref = node.ref !== undefined ? node.ref : this.generateRefFromName(node.name);

    // Build the final node, ensuring user-provided ref is preserved
    const finalNode: Node = {
      type: node.type,
      name: node.name,
      description: node.description,
      parameters: node.parameters,
      ...(node.metadata && { metadata: node.metadata }),
      ref,
    };

    this.nodes.push(finalNode);

    return ref;
  }

  /**
   * Add an edge connecting two nodes
   * @param from - Source node reference
   * @param to - Target node reference
   * @param condition - Optional edge condition
   * @returns this for chaining edges
   */
  addEdge(from: string, to: string, condition?: string): this {
    const ref = `edge_${from}_${to}`;

    this.edges.push({
      ref,
      from,
      to,
      ...(condition && { condition }),
    });

    return this;
  }

  /**
   * Set metadata for the blueprint
   * @param key - Metadata key
   * @param value - Metadata value
   * @returns this for chaining
   */
  setMetadata(key: string, value: unknown): this {
    this.metadata[key] = value;
    return this;
  }

  /**
   * Build and return the complete blueprint
   * @returns Complete Blueprint object
   */
  build(): Blueprint {
    const hasStart = this.nodes.some((n) => n.type === 'start');
    if (!hasStart) {
      throw new Error('Blueprint must have a start node');
    }

    return {
      nodes: this.nodes,
      edges: this.edges,
      metadata: {
        ...this.metadata,
        generatedBy: 'BlueprintBuilder',
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Reset the builder to start fresh
   * @returns this for chaining
   */
  reset(): this {
    this.nodes = [];
    this.edges = [];
    this.metadata = {};
    return this;
  }

  /**
   * Get current node count
   */
  getNodeCount(): number {
    return this.nodes.length;
  }

  /**
   * Get current edge count
   */
  getEdgeCount(): number {
    return this.edges.length;
  }
}
