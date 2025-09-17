/**
 * Workflow Class
 *
 * Executable workflow that combines Blueprint data with workflow building and execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Supports streaming through the injection-based architecture via Engine.
 */

import { BaseNode } from './BaseNode';
import { Engine, EngineConfig } from '@/engine/Engine';
import { NodeHandlerOptions, ValidationResult, WorkflowParams, ExecutionItem } from '@/types';
import { ValidationError } from '@/types/validation';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Workflow extends BaseNode<WorkflowParams> {
  private engine: Engine;

  constructor(params: WorkflowParams, options?: NodeHandlerOptions) {
    super(params, options);
    // Create engine - handles all node types internally
    const engineConfig = {
      blueprint: this.getParams().blueprint,
      eventCallback: this.getEventCallback(),
    } as EngineConfig;
    this.engine = new Engine(engineConfig);
  }

  /**
   * Execute the workflow with streaming support and optional input items
   */

  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Execute workflow through engine - it will handle streaming if configured
    // Note: Input data could be used to set initial state or pass to first node in future
    await this.engine.execute();
    const execution = this.engine.getExecution();

    // Return the execution wrapped as an item
    return ExecutionItemUtils.wrapSingle(execution, _input?.[0]);
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

    // Check that all node types have handlers (delegate to engine)
    const unsupportedNodes = params.blueprint.nodes.filter((node) => !this.engine.hasHandler(node.type));
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
