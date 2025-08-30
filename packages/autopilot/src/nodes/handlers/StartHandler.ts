/**
 * Start Node Handler
 * 
 * Handles workflow start nodes - always succeeds immediately
 * Uses lazy loading with BaseHandler
 */

import { BaseHandler } from '../Handler';
import { Execution, ValidationResult } from '../../types';

export class StartHandler extends BaseHandler {
  readonly type = 'start';

  async execute(execution: Execution) {
    return this.createSuccessResult({
      message: 'Workflow started'
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
    return 'play-circle';
  }
}