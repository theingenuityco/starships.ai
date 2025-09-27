import { BaseNodeHandler } from './BaseNodeHandler';
import { ExecutionItem } from '@/types';

/**
 * StartNode - Entry point for workflow execution
 * Passes through initial inputs or creates default input
 */
export class StartNode extends BaseNodeHandler {
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // If we have input, pass it through
    if (input && input.length > 0) {
      return input;
    }
    
    // Get initial inputs from context if available
    const initialInputs = this.context?.getInitialInputs();
    if (initialInputs && initialInputs.length > 0) {
      return initialInputs;
    }
    
    // Get parameters and use as initial data
    const params = this.getResolvedParameters();
    if (params.initialData) {
      return [this.createExecutionItem(params.initialData)];
    }
    
    // Return empty item to allow workflow to proceed
    return [this.createExecutionItem({
      type: 'start',
      timestamp: new Date().toISOString()
    })];
  }

  /**
   * Start node is always valid
   */
  validate() {
    return {
      valid: true,
      errors: []
    };
  }
}