/**
 * LLM Node Handler
 *
 * Executes LLM with direct LLM class instantiation
 * Uses BaseHandler pattern
 */

import { BaseHandler } from '../Handler';
import { Execution, ValidationResult, LlmNodeParameters, ValidationError, ValidationWarning } from '../../types';
import { LLM } from '../../LLM';

export class LlmHandler extends BaseHandler {
  readonly type = 'llm';

  async execute(execution: Execution) {
    const params = this.node.parameters as LlmNodeParameters;
    
    try {
      console.log(`Executing LLM: ${params.model}`);

      // Create LLM instance from the full parameters and execute
      const llm = new LLM(params);
      const llmResult = await llm.execute(execution);
      
      // Check if LLM execution was successful
      if (llmResult.status === 'completed') {
        return this.createSuccessResult(execution, {
          ...llmResult.data,
          output: `LLM ${params.model} completed successfully`
        });
      } else {
        // LLM execution failed
        const errorMessage = llmResult.error?.message || 'LLM execution failed';
        return this.createErrorResult(execution,
          `LLM ${params.model} execution failed: ${errorMessage}`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(execution,
        `LLM ${params.model} execution failed: ${errorMessage}`
      );
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as LlmNodeParameters;

    // Check for required fields first
    if (!params.model) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Model is required'
      ));
    }

    if (!params.prompt) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Prompt is required'
      ));
    }

    // Only do comprehensive validation if basic fields are present
    // to avoid duplicate error messages
    if (params.model && params.prompt) {
      // Use LLM class validation for comprehensive checking
      const llm = new LLM(params);
      const llmValidation = llm.validate();
      
      if (!llmValidation.valid) {
        llmValidation.errors.forEach(error => {
          // Skip errors we already caught above
          if (!error.includes('Model is required') &&
              !error.includes('Prompt is required')) {
            errors.push(this.createValidationError(
              'VALIDATION_FAILED',
              error
            ));
          }
        });
      }
    }

    // Warnings for common issues
    if (params.maxTokens && params.maxTokens > 4000) {
      warnings.push(this.createValidationWarning(
        'LARGE_WORKFLOW_SIZE',
        'High token count may result in expensive API calls'
      ));
    }

    if (params.timeout && params.timeout < 10000) {
      warnings.push(this.createValidationWarning(
        'POTENTIAL_TIMEOUT',
        'LLM requests may take longer than the specified timeout'
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
    return 'brain';
  }
}