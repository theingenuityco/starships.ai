/**
 * Parameter Processing System
 *
 * Handles template expression resolution for autopilot nodes.
 * Uses the centralized Eval class for template processing.
 */

import type { Execution, ValidationResult } from '@/types';
import { Eval, type EvalOptions } from './Eval';

/**
 * Core parameter processor that handles template resolution
 */
export class ParamProcessor {
  private eval = new Eval();

  /**
   * Resolve template expressions in parameters
   */
  async resolveTemplates(params: unknown, execution: Execution, options?: EvalOptions): Promise<unknown> {
    return await this.eval.resolveTemplates(params, execution, options);
  }

  /**
   * Check if a value contains template expressions
   */
  hasTemplateExpressions(value: unknown): boolean {
    return this.eval.hasTemplateExpressions(value);
  }

  /**
   * Validate template expressions in parameters
   */
  validateTemplateExpressions(params: unknown, options?: EvalOptions): ValidationResult {
    return this.eval.validateTemplateExpressions(params, options);
  }
}
