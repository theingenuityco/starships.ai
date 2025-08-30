/**
 * Workflow Node Handler
 *
 * Executes embedded workflow blueprints without agent-specific configuration
 * Uses BaseHandler pattern and focuses purely on workflow execution
 */

import { BaseHandler } from '../Handler';
import { ExecutionContext, ValidationResult, WorkflowNodeParameters, Node as WorkflowNode, ValidationError, ValidationWarning } from '../../types';
import { Workflow } from '../../Workflow';

export class WorkflowHandler extends BaseHandler {
  readonly type = 'workflow';

  async execute(context: ExecutionContext) {
    const startTime = Date.now();
    const params = this.node.parameters as WorkflowNodeParameters;
    
    try {
      console.log('Executing embedded workflow');
      
      // Prepare workflow execution context
      const existingState = (context.expeditionState as Record<string, unknown>) || {};
      const workflowContext: Partial<ExecutionContext> = {
        ...context,
        // Merge existing context with workflow-specific context
        expeditionState: {
          ...existingState,
          workflowNodeId: this.node.id,
          ...params.workflowContext
        }
      };

      // Create workflow instance from the blueprint and execute
      const workflow = new Workflow(params.blueprint);
      const workflowResult = await workflow.execute(workflowContext);
      
      // Check if workflow execution was successful
      if (workflowResult.status === 'completed') {
        // Collect all successful workflow results
        const workflowOutputs = Array.from(workflowResult.executionResults.values())
          .filter(result => result.success)
          .map(result => result.data);

        return this.createSuccessResult({
          workflowResults: workflowOutputs,
          workflowStatus: workflowResult.status,
          executionId: workflowResult.id,
          output: 'Workflow completed successfully'
        }, Date.now() - startTime);
      } else {
        // Workflow execution failed
        const errorMessage = workflowResult.error?.message || 'Workflow execution failed';
        return this.createErrorResult(
          `Workflow execution failed: ${errorMessage}`,
          Date.now() - startTime
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(
        `Workflow execution failed: ${errorMessage}`,
        Date.now() - startTime
      );
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as WorkflowNodeParameters;

    // Check for required fields
    if (!params.blueprint) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Blueprint is required'
      ));
    } else {
      // Validate blueprint structure
      if (!params.blueprint.nodes || params.blueprint.nodes.length === 0) {
        errors.push(this.createValidationError(
          'VALIDATION_FAILED',
          'Blueprint must contain at least one node'
        ));
      }

      // Check for start node
      if (params.blueprint.nodes) {
        const hasStartNode = params.blueprint.nodes.some(n => n.type === 'start');
        if (!hasStartNode) {
          errors.push(this.createValidationError(
            'MISSING_START_NODE',
            'Blueprint must have a start node'
          ));
        }
      }

      // Check for valid edge references
      if (params.blueprint.edges && params.blueprint.nodes) {
        const nodeIds = new Set(params.blueprint.nodes.map(n => n.id));
        for (const edge of params.blueprint.edges) {
          if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
            errors.push(this.createValidationError(
              'INVALID_EDGE_CONNECTION',
              `Invalid edge reference in blueprint: ${edge.from} -> ${edge.to}`
            ));
          }
        }
      }
    }

    // Check timeout if provided
    if (params.timeout !== undefined && params.timeout < 1000) {
      warnings.push(this.createValidationWarning(
        'POTENTIAL_TIMEOUT',
        'Workflow timeout is less than 1 second, which may be too short for complex workflows'
      ));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: []
    };
  }

  getIcon(): string {
    return 'workflow';
  }
}