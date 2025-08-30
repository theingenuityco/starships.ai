/**
 * Workflow Class
 * 
 * Executable workflow that combines Blueprint data with handler management and execution capabilities.
 * Replaces the Registry pattern with integrated handler management.
 */

import { Blueprint, Node, Edge, ExecutionContext, RuntimeState, NodeType } from './types';
import { Handler } from './nodes/Handler';
import { Engine } from './engine/Engine';
import { 
  StartHandler, 
  EndHandler, 
  AgentHandler, 
  ConditionalHandler, 
  PromptHandler, 
  OutputHandler 
} from './nodes/handlers';
import { v4 as uuidv4 } from 'uuid';

export class Workflow {
  private blueprint: Blueprint;
  private handlers: Map<string, Handler> = new Map();
  private engine: Engine;

  constructor(blueprintOrId: Blueprint | string) {
    // Initialize blueprint
    if (typeof blueprintOrId === 'string') {
      this.blueprint = {
        id: blueprintOrId,
        nodes: [],
        edges: [],
        metadata: {}
      };
    } else {
      this.blueprint = { ...blueprintOrId };
    }

    // Initialize default handlers (replaces Registry functionality)
    this.initializeDefaultHandlers();

    // Create engine with handler lookup function
    this.engine = new Engine(this.handlers);
  }

  /**
   * Initialize default handlers for all supported node types
   */
  private initializeDefaultHandlers(): void {
    this.registerHandler(new StartHandler());
    this.registerHandler(new EndHandler());
    this.registerHandler(new AgentHandler());
    this.registerHandler(new ConditionalHandler());
    this.registerHandler(new PromptHandler());
    this.registerHandler(new OutputHandler());
  }

  /**
   * Register a node handler (replaces Registry.register)
   */
  registerHandler(handler: Handler): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`Overriding existing handler for node type: ${handler.type}`);
    }
    
    this.handlers.set(handler.type, handler);
    console.log(`Registered node handler: ${handler.type}`);
  }

  /**
   * Get handler for a node type (replaces Registry.getHandler)
   */
  getHandler(type: string): Handler | null {
    return this.handlers.get(type) || null;
  }

  /**
   * Get all registered handler types (replaces Registry.getSupportedTypes)
   */
  getSupportedTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a node type is supported (replaces Registry.hasHandler)
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
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
   * Get workflow ID
   */
  getId(): string {
    return this.blueprint.id;
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

    // Check that all node types have handlers
    const unsupportedNodes = this.blueprint.nodes.filter(node => !this.hasHandler(node.type));
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
   * Clone workflow with a new ID
   */
  clone(newId?: string): Workflow {
    const clonedBlueprint: Blueprint = {
      ...this.blueprint,
      id: newId || `${this.blueprint.id}-copy`,
      nodes: this.blueprint.nodes.map(node => ({ ...node })),
      edges: this.blueprint.edges.map(edge => ({ ...edge }))
    };

    return new Workflow(clonedBlueprint);
  }
}