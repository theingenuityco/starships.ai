import { BaseNode } from './BaseNode';
import { StartParams, ValidationResult, ExecutionItem, NodeHandlerOptions } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Start extends BaseNode<StartParams> {
  constructor(params?: StartParams, options?: NodeHandlerOptions) {
    super(params || {}, options);
  }

  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Pass through input if provided (Engine handles __initial__ for tool blueprints)
    if (input && input.length > 0) {
      return input;
    }
    // Default to empty object for regular workflows
    return ExecutionItemUtils.wrapSingle({});
  }

  validate(): ValidationResult {
    return {
      valid: true,
    };
  }
}
