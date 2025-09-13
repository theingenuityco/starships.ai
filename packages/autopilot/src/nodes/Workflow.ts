/**
 * Workflow Class
 *
 * Executable workflow that combines Blueprint data with workflow building and execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Supports streaming through the injection-based architecture via Engine.
 */

import { Engine, EngineConfig } from '@/engine/Engine';
import { NodeResult, ValidationResult, WorkflowParams } from '@/types';
import { ValidationError } from '@/types/validation';
import { EventCallback } from '@/types/emitters';
import { NodeHandler } from '@/engine/NodeHandler';

export class Workflow implements NodeHandler {
  private params: WorkflowParams;
  private engine: Engine;
  private eventCallback?: EventCallback;

  constructor(params: WorkflowParams, eventCallback?: EventCallback) {
    // Store parameters with cloned blueprint
    this.params = structuredClone(params);
    this.eventCallback = eventCallback;
    // Create engine - handles all node types internally
    const engineConfig = {
      blueprint: this.params.blueprint,
      eventCallback: this.eventCallback,
    } as EngineConfig;
    this.engine = new Engine(engineConfig);
  }

  /**
   * Execute the workflow with streaming support
   */
  async execute(): Promise<NodeResult[]> {
    // Execute workflow through engine - it will handle streaming if configured
    await this.engine.execute();
    return this.engine.getExecution().results;
  }

  /**
   * Validate workflow structure
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Check for start node
    const hasStartNode = this.params.blueprint.nodes.some((node) => node.type === 'start');
    if (!hasStartNode) {
      errors.push({
        code: 'MISSING_START_NODE',
        message: 'Workflow must have a start node',
      });
    }

    // Check that all node types have handlers (delegate to engine)
    const unsupportedNodes = this.params.blueprint.nodes.filter((node) => !this.engine.hasHandler(node.type));
    if (unsupportedNodes.length > 0) {
      unsupportedNodes.forEach((node) => {
        errors.push({
          code: 'INVALID_NODE_TYPE',
          message: `Unsupported node type: ${node.type}`,
          nodeRef: node.ref,
        });
      });
    }

    // Check edge references
    const nodeRefs = new Set(this.params.blueprint.nodes.map((n) => n.ref));
    const invalidEdges = this.params.blueprint.edges.filter((edge) => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to));
    if (invalidEdges.length > 0) {
      invalidEdges.forEach((edge) => {
        errors.push({
          code: 'INVALID_EDGE_CONNECTION',
          message: `Invalid edge connection from ${edge.from} to ${edge.to}`,
          edgeRef: edge.ref,
        });
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
