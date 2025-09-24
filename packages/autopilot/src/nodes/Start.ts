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
    
    // Look for initial input in execution.results with nodeRef '__initial__'
    if (execution && execution.results && execution.results.length > 0) {
      const initialResult = execution.results.find((r: { nodeRef: string }) => r.nodeRef === '__initial__');
      if (initialResult && initialResult.items && initialResult.items.length > 0) {
        // Pass through the initial input (tool arguments)
        console.log('[START NODE] Passing through initial input:', JSON.stringify(initialResult.items[0]));
        return initialResult.items;
      }
    }
    
    // Fallback: check old execution.input format for backwards compatibility
    if (execution && execution.input && execution.input.length > 0) {
      console.log('[START NODE] Passing through execution input (legacy):', JSON.stringify(execution.input[0]));
      return execution.input;
    }
    
    // Pass through direct input if provided (from main branch update)
    if (_input && _input.length > 0) {
      return _input;
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
