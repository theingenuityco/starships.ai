/**
 * User Prompt Handler
 *
 * User prompt handler using BaseHandler pattern - will need UI integration
 */

import { NodeHandler } from '@/types/node-handler';
import { LlmMessage, UserPromptParams, ValidationError, ValidationResult } from '@/types';

export interface UserPromptResponse {
  message: LlmMessage;
}

export class UserPrompt implements NodeHandler {
  params: UserPromptParams;

  constructor(params: UserPromptParams) {
    this.params = params;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input?: unknown): Promise<UserPromptResponse> {
    const params = this.params as UserPromptParams;
    // TODO: Integrate with UI system for user prompts
    // This will need to pause execution and wait for user input

    // For now, return a placeholder result
    return {
      message: {
        content: params.choices[0].text,
        role: 'user',
      },
    };
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.params as UserPromptParams;

    if (!params.promptText) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Prompt text is required',
      });
    }

    if (!params.choices || params.choices.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one choice is required',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  getIcon(): string {
    return 'message-circle';
  }
}
