import { BaseNode } from './BaseNode';
import { StartParams, ValidationResult, ExecutionItem, NodeHandlerOptions } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Start extends BaseNode<StartParams> {
  constructor(params?: StartParams, options?: NodeHandlerOptions) {
    super(params || {}, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Pass through direct input if provided
    if (_input && _input.length > 0) {
      return _input;
    }
    
    // Check if we have execution input to pass through (for tool blueprints)
    const execution = this.getOptions()?.execution as any;
    if (execution?.input?.length > 0) {
      return execution.input;
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
