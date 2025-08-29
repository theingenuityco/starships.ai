/**
 * Start Node Handler
 * 
 * Handles workflow start nodes - always succeeds immediately
 */

import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult } from '../../types';

export class StartHandler implements Handler {
  readonly type = 'start';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    return {
      nodeId: node.id,
      success: true,
      data: { message: 'Workflow started' },
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
    return 'play-circle';
  }
}