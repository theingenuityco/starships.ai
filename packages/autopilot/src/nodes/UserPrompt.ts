/**
 * User Prompt Handler
 *
 * User prompt handler using BaseHandler pattern - will need UI integration
 */

import { NodeHandler } from '@/types/node-handler';
import { LlmMessage, UserPromptParams, ValidationError, ValidationResult, ExecutionItem } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export interface UserPromptResponse {
  message: LlmMessage;
}

export class UserPrompt implements NodeHandler {
  params: UserPromptParams;

  constructor(params: UserPromptParams) {
    this.params = params;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.params as UserPromptParams;
    // TODO: Integrate with UI system for user prompts
    // This will need to pause execution and wait for user input

    // For now, return a placeholder result
    const response = {
      message: {
        content: params.choices[0].text,
        role: 'user',
      },
    };

    return ExecutionItemUtils.wrapSingle(response);
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
