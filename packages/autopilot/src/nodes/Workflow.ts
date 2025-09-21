/**
 * Workflow Class
 *
 * Executable workflow that combines Blueprint data with workflow building and execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Supports streaming through the injection-based architecture via Engine.
 */

import { BaseNode } from './BaseNode';
import { NodeHandlerOptions, ValidationResult, WorkflowParams, ExecutionItem } from '@/types';
import { ValidationError } from '@/types/validation';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { Engine } from '@/engine/Engine';

export class Workflow extends BaseNode<WorkflowParams> {
  constructor(params: WorkflowParams, options?: NodeHandlerOptions) {
    super(params, options);
    // Workflow no longer creates internal Engine - will be executed by external Engine
  }

  /**
   * Execute the workflow with streaming support and optional input items
   * Creates a new Engine instance and executes the workflow's blueprint
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();

    // Create a new Engine instance for executing the workflow's blueprint
    const engine = new Engine({
      eventCallback: this.options?.eventCallback,
    });

    // Create execution context for the workflow's blueprint
    const parentExecution = this.options?.execution;
    const execution = ExecutionItemUtils.createExecution(input, parentExecution);

    try {
      // Execute the workflow's blueprint using the new Engine
      return await engine.executeBlueprint(params.blueprint, execution);
    } catch (error) {
      throw new Error(`Workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate workflow structure
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    // Check for start node
    const hasStartNode = params.blueprint.nodes.some((node) => node.type === 'start');
    if (!hasStartNode) {
      errors.push({
        code: 'MISSING_START_NODE',
        message: 'Workflow must have a start node',
      });
    }

    // Note: Node type validation will be handled by external Engine during execution

    // Check edge references
    const nodeRefs = new Set(params.blueprint.nodes.map((n) => n.ref));
    const invalidEdges = params.blueprint.edges.filter((edge) => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to));
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
