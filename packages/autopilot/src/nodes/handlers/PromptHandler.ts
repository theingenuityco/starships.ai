/**
 * User Prompt Handler
 * 
 * User prompt handler - will need UI integration
 */

import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, UserPromptNodeParameters } from '../../types';

export class PromptHandler implements Handler {
  readonly type = 'user_prompt';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as UserPromptNodeParameters;
    
    // TODO: Integrate with UI system for user prompts
    // This will need to pause execution and wait for user input
    console.log(`User prompt: ${params.promptText}`);
    console.log('Choices:', params.choices);
    
    // For now, return a placeholder result
    return {
      nodeId: node.id,
      success: true,
      data: { choice: params.choices[0], userInput: 'placeholder' },
      executedAt: new Date().toISOString(),
      duration: 100
    };
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as UserPromptNodeParameters;
    const errors = [];

    if (!params.promptText) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Prompt text is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.choices || params.choices.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one choice is required',
        nodeId: node.id,
        severity: 'error' as const
      });
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