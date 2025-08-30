/**
 * User Prompt Handler
 * 
 * User prompt handler using BaseHandler pattern - will need UI integration
 */

import { BaseHandler } from '../Handler';
import { ExecutionContext, ValidationResult, UserPromptNodeParameters } from '../../types';

export class PromptHandler extends BaseHandler {
  readonly type = 'user_prompt';
  private params: UserPromptNodeParameters;

  constructor(parameters: any, nodeId: string) {
    super(parameters, nodeId);
    this.params = parameters as UserPromptNodeParameters;
  }

  async execute(context: ExecutionContext) {
    // TODO: Integrate with UI system for user prompts
    // This will need to pause execution and wait for user input
    console.log(`User prompt: ${this.params.promptText}`);
    console.log('Choices:', this.params.choices);
    
    // For now, return a placeholder result
    return this.createSuccessResult({
      choice: this.params.choices[0], 
      userInput: 'placeholder'
    }, 100);
  }

  validate(): ValidationResult {
    const errors = [];

    if (!this.params.promptText) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Prompt text is required'
      ));
    }

    if (!this.params.choices || this.params.choices.length === 0) {
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