import { BaseNodeHandler } from './BaseNodeHandler';
import { ExecutionItem } from '@/types';

/**
 * EndNode - Terminal node for workflow execution
 * Aggregates and formats final results
 */
export class EndNode extends BaseNodeHandler {
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // If no input, return empty result
    if (!input || input.length === 0) {
      return [this.createExecutionItem({
        type: 'end',
        message: 'Workflow completed with no results',
        timestamp: new Date().toISOString()
      })];
    }
    
    const params = this.getResolvedParameters();
    
    // Check if we should aggregate results
    if (params.aggregate === true) {
      // Aggregate all inputs into a single result
      const aggregatedData = input.map(item => item.json);
      return [this.createExecutionItem({
        type: 'end',
        results: aggregatedData,
        count: aggregatedData.length,
        timestamp: new Date().toISOString()
      })];
    }
    
    // Check if we should filter results
    if (params.filter) {
      const filtered = this.filterResults(input, params.filter as string);
      if (filtered.length === 0) {
        return [this.createExecutionItem({
          type: 'end',
          message: 'No results matched filter',
          timestamp: new Date().toISOString()
        })];
      }
      return filtered;
    }
    
    // Pass through all results as-is
    return input;
  }

  /**
   * Filter results based on criteria
   */
  private filterResults(input: ExecutionItem[], filter: string): ExecutionItem[] {
    if (filter === 'errors') {
      return input.filter(item => item.error !== undefined);
    }
    
    if (filter === 'success') {
      return input.filter(item => item.error === undefined);
    }
    
    if (filter === 'first') {
      return input.slice(0, 1);
    }
    
    if (filter === 'last') {
      return input.slice(-1);
    }
    
    // Try to use filter as a property check
    if (filter.includes('.')) {
      return input.filter(item => {
        const value = this.getNestedValue(item.json, filter);
        return value !== undefined && value !== null;
      });
    }
    
    return input;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  /**
   * End node is always valid
   */
  validate() {
    return {
      valid: true,
      errors: []
    };
  }
}