import { BaseNode } from './BaseNode';
import { StartParams, ValidationResult, ExecutionItem, NodeHandlerOptions } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Start extends BaseNode<StartParams> {
  constructor(params?: StartParams, options?: NodeHandlerOptions) {
    super(params || {}, options);
  }

  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Pass through direct input if provided
    if (_input && _input.length > 0) {
      return _input;
    }
    
    // Check if we have execution input to pass through (for tool blueprints)
    const execution = this.getOptions()?.execution;
    
    // Look for initial input in execution.results with nodeRef '__initial__'
    if (execution?.results && execution.results.length > 0) {
      const initialResult = execution.results.find((r) => r.nodeRef === '__initial__');
      if (initialResult?.items && initialResult.items.length > 0) {
        // Pass through the initial input (tool arguments)
        return initialResult.items;
      }
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
