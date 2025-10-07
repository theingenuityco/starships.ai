/**
 * BlueprintBuilder
 *
 * Type-safe builder for constructing blueprints. Accepts complete node objects
 * with compile-time type checking based on node type.
 */

import { Blueprint, Node, Edge } from '@/types';

/**
 * Node input without the ref field (generated automatically)
 */
type NodeInput = Omit<Node, 'ref'>;

export class BlueprintBuilder {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private nodeCounter: number = 1;
  private edgeCounter: number = 1;
  private metadata: Record<string, unknown> = {};

  /**
   * Add a node to the blueprint
   * Accepts a complete node object (without ref) with full type safety
   * @param node - Complete node object with type, name, parameters, etc.
   * @returns The generated node reference for use in edges
   */
  addNode(node: NodeInput): string {
    const ref = `${node.type}_${this.nodeCounter++}`;

    this.nodes.push({
      ...node,
      ref,
    });

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
    const ref = `edge_${this.edgeCounter++}`;

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
    this.nodeCounter = 1;
    this.edgeCounter = 1;
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
