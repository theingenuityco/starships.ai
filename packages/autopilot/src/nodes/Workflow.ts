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

export class Workflow extends BaseNode<WorkflowParams> {
  constructor(params: WorkflowParams, options?: NodeHandlerOptions) {
    super(params, options);
    // Workflow no longer creates internal Engine - will be executed by external Engine
  }

  /**
   * Execute the workflow with streaming support and optional input items
   * Note: This method now returns the workflow's blueprint for execution by an external Engine
   */
  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Return the workflow's blueprint for external Engine execution
    const params = this.getParams();
    return ExecutionItemUtils.wrapSingle(
      {
        blueprint: params.blueprint,
        workflowParams: params,
      },
      _input?.[0]
    );
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
