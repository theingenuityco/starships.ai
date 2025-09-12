/**
 * Workflow Node Handler
 *
 * Executes embedded workflow blueprints without agent-specific configuration
 * Uses BaseHandler pattern and focuses purely on workflow execution
 */

import { BaseHandler } from '@/nodes/Handler';
import { Execution, ValidationError, ValidationResult, ValidationWarning, WorkflowParams } from '@/types';
import { Workflow } from '@/Workflow';

export class WorkflowHandler extends BaseHandler {
  readonly type = 'workflow';

  async execute(execution: Execution) {
    const params = this.node.parameters as WorkflowParams;

    try {
      console.log('Executing embedded workflow');

      // Create workflow instance from the full parameters and execute
      const workflow = new Workflow(params);
      const workflowResult = await workflow.execute();

      // Check if workflow execution was successful
      if (workflowResult.status === 'completed') {
        // Collect all successful workflow results
        const workflowOutputs = Array.from(workflowResult.results.values())
          .filter((result) => !result.error)
          .map((result) => result.data);

        return this.createSuccessResult(execution, {
          workflowResults: workflowOutputs,
          workflowStatus: workflowResult.status,
          output: 'Workflow completed successfully',
        });
      } else {
        // Workflow execution failed
        const errorMessage = workflowResult.error?.message || 'Workflow execution failed';
        return this.createErrorResult(execution, `Workflow execution failed: ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(execution, `Workflow execution failed: ${errorMessage}`);
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as WorkflowParams;

    // Check for required fields
    if (!params.blueprint) {
      errors.push(this.createValidationError('MISSING_REQUIRED_FIELD', 'Blueprint is required'));
    } else {
      // Validate blueprint structure
      if (!params.blueprint.nodes || params.blueprint.nodes.length === 0) {
        errors.push(this.createValidationError('VALIDATION_FAILED', 'Blueprint must contain at least one node'));
      }

      // Check for start node
      if (params.blueprint.nodes) {
        const hasStartNode = params.blueprint.nodes.some((n) => n.type === 'start');
        if (!hasStartNode) {
          errors.push(this.createValidationError('MISSING_START_NODE', 'Blueprint must have a start node'));
        }
      }

      // Check for valid edge references
      if (params.blueprint.edges && params.blueprint.nodes) {
        const nodeRefs = new Set(params.blueprint.nodes.map((n) => n.ref));
        for (const edge of params.blueprint.edges) {
          if (!nodeRefs.has(edge.from) || !nodeRefs.has(edge.to)) {
            errors.push(
              this.createValidationError('INVALID_EDGE_CONNECTION', `Invalid edge reference in blueprint: ${edge.from} -> ${edge.to}`)
            );
          }
        }
      }
    }

    // Check timeout if provided
    if (params.timeout !== undefined && params.timeout < 1000) {
      warnings.push(
        this.createValidationWarning(
          'POTENTIAL_TIMEOUT',
          'Workflow timeout is less than 1 second, which may be too short for complex workflows'
        )
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: [],
    };
  }

  getIcon(): string {
    return 'workflow';
  }
}
