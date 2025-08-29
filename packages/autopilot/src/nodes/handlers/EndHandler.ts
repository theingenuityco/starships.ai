/**
 * End Node Handler
 * 
 * Handles workflow end nodes - always succeeds immediately
 */

import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult } from '../../types';

export class EndHandler implements Handler {
  readonly type = 'end';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    return {
      nodeId: node.id,
      success: true,
      data: { message: 'Workflow completed' },
      executedAt: new Date().toISOString(),
      duration: 0
    };
  }

  validate(node: Node): ValidationResult {
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