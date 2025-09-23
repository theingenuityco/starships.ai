import { BaseNode } from './BaseNode';
import { StartParams, ValidationResult, ExecutionItem, NodeHandlerOptions } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Start extends BaseNode<StartParams> {
  constructor(params?: StartParams, options?: NodeHandlerOptions) {
    super(params || {}, options);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Check if we have execution input to pass through (for tool blueprints)
    const execution = this.getOptions()?.execution as any;
    if (execution && execution.input && execution.input.length > 0) {
      // Pass through the execution input (tool arguments)
      console.log('[START NODE] Passing through execution input:', JSON.stringify(execution.input[0]));
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
