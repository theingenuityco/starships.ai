/**
 * Agent Node Handler
 *
 * Executes agent with embedded workflow functionality
 * Uses BaseHandler pattern
 */

import { BaseHandler } from '@/nodes/Handler';
import { Execution, ValidationResult, AgentParams, ValidationError, ValidationWarning } from '@/types';
import { Agent } from '@/Agent';

export class AgentHandler extends BaseHandler {
  readonly type = 'agent';

  async execute(execution: Execution) {
    const params = this.node.parameters as AgentParams;

    try {
      console.log(`Executing agent: ${params.name} (model: ${params.model}) with workflow execution`);

      // Create agent instance from the full parameters and execute
      const agent = new Agent(params);
      const agentResult = await agent.execute();

      // Check if agent execution was successful
      if (agentResult.status === 'completed') {
        // Collect all successful agent results
        const agentOutputs = Array.from(agentResult.results.values())
          .filter((result) => !result.error)
          .map((result) => result.data);

        return this.createSuccessResult(execution, {
          agentName: params.name,
          model: params.model,
          workflowResults: agentOutputs,
          workflowStatus: agentResult.status,
          output: `Agent ${params.name} completed workflow execution successfully`,
        });
      } else {
        // Agent execution failed
        const errorMessage = agentResult.error?.message || 'Agent execution failed';
        return this.createErrorResult(execution, `Agent ${params.name} workflow execution failed: ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(execution, `Agent ${params.name} workflow execution failed: ${errorMessage}`);
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as AgentParams;

    // Check for required fields first
    if (!params.name) {
      errors.push(this.createValidationError('MISSING_REQUIRED_FIELD', 'Agent name is required'));
    }

    if (!params.model) {
      errors.push(this.createValidationError('MISSING_REQUIRED_FIELD', 'Agent model is required'));
    }

    if (!params.memory) {
      errors.push(this.createValidationError('MISSING_REQUIRED_FIELD', 'Agent memory is required'));
    }

    if (!params.blueprint) {
      errors.push(this.createValidationError('MISSING_REQUIRED_FIELD', 'Agent workflow is required'));
    } else {
      // Only do comprehensive validation if basic fields are present
      // to avoid duplicate error messages
      if (params.name && params.model && params.memory) {
        // Use Agent class validation for comprehensive checking
        const agent = new Agent(params);
        const agentValidation = agent.validate();

        if (!agentValidation.valid) {
          agentValidation.errors.forEach((error) => {
            // Skip errors we already caught above
            if (
              !error.includes('Agent name is required') &&
              !error.includes('Agent model is required') &&
              !error.includes('Agent memory is required') &&
              !error.includes('Agent blueprint is required')
            ) {
              errors.push(this.createValidationError('VALIDATION_FAILED', error));
            }
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: [],
    };
  }

  getIcon(): string {
    return 'robot';
  }
}
