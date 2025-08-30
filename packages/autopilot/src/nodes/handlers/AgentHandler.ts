/**
 * Agent Node Handler
 *
 * Executes agent with embedded workflow functionality
 * Uses BaseHandler pattern
 */

import { BaseHandler } from '../Handler';
import { Execution, ValidationResult, AgentNodeParameters, ValidationError, ValidationWarning } from '../../types';
import { Workflow } from '../../Workflow';

export class AgentHandler extends BaseHandler {
  readonly type = 'agent';

  async execute(execution: Execution) {
    const startTime = Date.now();
    const params = this.node.parameters as AgentNodeParameters;
    
    try {
      console.log(`Executing agent: ${params.name} (model: ${params.model}) with workflow execution`);

      // Create workflow instance from the agent's blueprint and execute
      const workflow = new Workflow(params.blueprint);
      const workflowResult = await workflow.execute();
      
      // Check if workflow execution was successful
      if (workflowResult.status === 'completed') {
        // Collect all successful workflow results
        const workflowOutputs = Array.from(workflowResult.executionResults.values())
          .filter(result => result.success)
          .map(result => result.data);

        return this.createSuccessResult({
          agentName: params.name,
          model: params.model,
          systemPrompt: params.systemPrompt,
          instructions: params.instructions,
          workflowResults: workflowOutputs,
          workflowStatus: workflowResult.status,
          output: `Agent ${params.name} completed workflow execution successfully`
        }, Date.now() - startTime);
      } else {
        // Workflow execution failed
        const errorMessage = workflowResult.error?.message || 'Workflow execution failed';
        return this.createErrorResult(
          `Agent ${params.name} workflow execution failed: ${errorMessage}`,
          Date.now() - startTime
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(
        `Agent ${params.name} execution failed: ${errorMessage}`,
        Date.now() - startTime
      );
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as AgentNodeParameters;

    // Check for required fields
    if (!params.name) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Agent name is required'
      ));
    }

    if (!params.model) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Agent model is required'
      ));
    }

    if (!params.blueprint) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Agent workflow is required'
      ));
    } else {
      // Validate workflow structure
      if (!params.blueprint.nodes || params.blueprint.nodes.length === 0) {
        errors.push(this.createValidationError(
          'VALIDATION_FAILED',
          'Agent workflow must contain at least one node'
        ));
      }

      // Check for start node
      const hasStartNode = params.blueprint.nodes.some(n => n.type === 'start');
      if (!hasStartNode) {
        errors.push(this.createValidationError(
          'MISSING_START_NODE',
          'Agent workflow must have a start node'
        ));
      }

      // Check for circular references in workflow
      if (params.blueprint.edges && params.blueprint.edges.length > 0) {
        const nodeRefs = new Set(params.blueprint.nodes.map(n => n.ref));
        for (const edge of params.blueprint.edges) {
          if (!nodeRefs.has(edge.from) || !nodeRefs.has(edge.to)) {
            errors.push(this.createValidationError(
              'INVALID_EDGE_CONNECTION',
              `Invalid edge reference in workflow: ${edge.from} -> ${edge.to}`
            ));
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: []
    };
  }

  getIcon(): string {
    return 'robot';
  }
}