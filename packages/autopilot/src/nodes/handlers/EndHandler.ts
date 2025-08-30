/**
 * End Node Handler
 * 
 * Handles workflow end nodes - always succeeds immediately
 * Uses lazy loading with BaseHandler
 */

import { BaseHandler } from '../Handler';
import { RuntimeState, ValidationResult } from '../../types';

export class EndHandler extends BaseHandler {
  readonly type = 'end';

  async execute(runtimeState: RuntimeState) {
    return this.createSuccessResult({
      message: 'Workflow completed'
    });
  }

  validate(): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'check-circle';
  }
}