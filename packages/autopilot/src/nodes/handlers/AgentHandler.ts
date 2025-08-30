/**
 * Agent Node Handler
 *
 * Executes agent with embedded workflow functionality
 * Uses BaseHandler pattern
 */

import { BaseHandler } from '../Handler';
import { ExecutionContext, ValidationResult, AgentNodeParameters } from '../../types';
import { Workflow } from '../../Workflow';

export class AgentHandler extends BaseHandler {
  readonly type = 'agent';
  private params: AgentNodeParameters;

  constructor(parameters: any, nodeId: string) {
    super(parameters, nodeId);
    this.params = parameters as AgentNodeParameters;
  }

  async execute(context: ExecutionContext) {
    const startTime = Date.now();
    
    try {
      console.log(`Executing agent: ${this.params.name} (model: ${this.params.model}) with workflow execution`);
      
      // Prepare workflow execution context
      const existingState = (context.expeditionState as Record<string, unknown>) || {};
      const workflowContext: Partial<ExecutionContext> = {
        ...context,
        // Merge agent context with workflow context
        expeditionState: {
          ...existingState,
          agentName: this.params.name,
          agentModel: this.params.model,
          agentSystemPrompt: this.params.systemPrompt,
          agentInstructions: this.params.instructions,
          ...this.params.workflowContext
        }
      };

      // Create workflow instance from the agent's blueprint and execute
      const workflow = new Workflow(this.params.blueprint);
      const workflowResult = await workflow.execute(workflowContext);
      
      // Check if workflow execution was successful
      if (workflowResult.status === 'completed') {
        // Collect all successful workflow results
        const workflowOutputs = Array.from(workflowResult.executionResults.values())
          .filter(result => result.success)
          .map(result => result.data);

        return this.createSuccessResult({
          agentName: this.params.name,
          model: this.params.model,
          systemPrompt: this.params.systemPrompt,
          instructions: this.params.instructions,
          workflowId: this.params.blueprint.id,
          workflowResults: workflowOutputs,
          workflowStatus: workflowResult.status,
          output: `Agent ${this.params.name} completed workflow execution successfully`
        }, Date.now() - startTime);
      } else {
        // Workflow execution failed
        const errorMessage = workflowResult.error?.message || 'Workflow execution failed';
        return this.createErrorResult(
          `Agent ${this.params.name} workflow execution failed: ${errorMessage}`,
          Date.now() - startTime
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(
        `Agent ${this.params.name} execution failed: ${errorMessage}`,
        Date.now() - startTime
      );
    }
  }

  validate(): ValidationResult {
    const errors = [];
    const warnings = [];

    // Check for required fields
    if (!this.params.name) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Agent name is required'
      ));
    }

    if (!this.params.model) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Agent model is required'
      ));
    }

    if (!this.params.blueprint) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Agent workflow is required'
      ));
    } else {
      // Validate workflow structure
      if (!this.params.blueprint.nodes || this.params.blueprint.nodes.length === 0) {
        errors.push(this.createValidationError(
          'INVALID_WORKFLOW',
          'Agent workflow must contain at least one node'
        ));
      }

      // Check for start node
      const hasStartNode = this.params.blueprint.nodes.some(n => n.type === 'start');
      if (!hasStartNode) {
        errors.push(this.createValidationError(
          'INVALID_WORKFLOW',
          'Agent workflow must have a start node'
        ));
      }

      // Check for circular references in workflow
      if (this.params.blueprint.edges && this.params.blueprint.edges.length > 0) {
        const nodeIds = new Set(this.params.blueprint.nodes.map(n => n.id));
        for (const edge of this.params.blueprint.edges) {
          if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
            errors.push(this.createValidationError(
              'INVALID_WORKFLOW',
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