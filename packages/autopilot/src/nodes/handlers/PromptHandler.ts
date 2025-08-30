/**
 * User Prompt Handler
 * 
 * User prompt handler using BaseHandler pattern - will need UI integration
 */

import { BaseHandler } from '../Handler';
import { Execution, ValidationResult, UserPromptNodeParameters, Node as WorkflowNode, ValidationError } from '../../types';

export class PromptHandler extends BaseHandler {
  readonly type = 'user_prompt';

  async execute(initialExecution?: Execution) {
    const params = this.node.parameters as UserPromptNodeParameters;
    // TODO: Integrate with UI system for user prompts
    // This will need to pause execution and wait for user input
    console.log(`User prompt: ${params.promptText}`);
    console.log('Choices:', params.choices);
    
    // For now, return a placeholder result
    return this.createSuccessResult({
      choice: params.choices[0],
      userInput: 'placeholder'
    }, 100);
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.node.parameters as UserPromptNodeParameters;

    if (!params.promptText) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Prompt text is required'
      ));
    }

    if (!params.choices || params.choices.length === 0) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'At least one choice is required'
      ));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'message-circle';
  }
}