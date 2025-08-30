/**
 * Start Node Handler
 * 
 * Handles workflow start nodes - always succeeds immediately
 * Uses lazy loading with BaseHandler
 */

import { BaseHandler } from '../Handler';
import { RuntimeState, ValidationResult } from '../../types';

export class StartHandler extends BaseHandler {
  readonly type = 'start';

  async execute(runtimeState: RuntimeState) {
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