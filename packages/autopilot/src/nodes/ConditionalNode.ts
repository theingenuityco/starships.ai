import { BaseNodeHandler } from './BaseNodeHandler';
import { ExecutionItem, ValidationResult } from '@/types';

/**
 * ConditionalNode - Evaluates conditions for dynamic routing
 * Returns an edge condition for the router to use
 */
export class ConditionalNode extends BaseNodeHandler {
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getResolvedParameters();
    
    // Get the condition expression
    const condition = params.condition as string || 'true';
    
    // Evaluate the condition
    const result = await this.evaluateCondition(condition, input);
    
    // Return result with edge condition for routing
    return [this.createExecutionItem({
      result: result,
      edgeCondition: String(result), // Used by router for edge selection
      type: 'conditional',
      condition: condition
    })];
  }

  /**
   * Evaluate a condition expression
   */
  private async evaluateCondition(condition: string, input?: ExecutionItem[]): Promise<boolean | string> {
    // Handle simple boolean conditions
    if (condition === 'true') {
      return true;
    }
    if (condition === 'false') {
      return false;
    }
    
    // Check if it's a JavaScript expression
    if (condition.includes('&&') || condition.includes('||') || 
        condition.includes('===') || condition.includes('!==') ||
        condition.includes('>') || condition.includes('<')) {
      try {
        // Create safe evaluation context
        const context = this.createEvaluationContext(input);
        return this.safeEvaluate(condition, context);
      } catch (error) {
        console.error('Failed to evaluate condition:', error);
        return false;
      }
    }
    
    // Check for special conditions
    if (condition === 'has_tool_calls' || condition === 'hasToolCalls') {
      return this.hasToolCalls(input);
    }
    
    if (condition === 'no_tool_calls' || condition === 'noToolCalls') {
      return !this.hasToolCalls(input);
    }
    
    if (condition.startsWith('count>')) {
      const threshold = parseInt(condition.substring(6), 10);
      return this.getItemCount(input) > threshold;
    }
    
    if (condition.startsWith('count<')) {
      const threshold = parseInt(condition.substring(6), 10);
      return this.getItemCount(input) < threshold;
    }
    
    if (condition === 'has_errors' || condition === 'hasErrors') {
      return this.hasErrors(input);
    }
    
    if (condition === 'complete' || condition === 'success') {
      return !this.hasErrors(input);
    }
    
    // Return condition as-is for custom edge conditions
    return condition;
  }

  /**
   * Create evaluation context for expressions
   */
  private createEvaluationContext(input?: ExecutionItem[]): any {
    const firstItem = input?.[0]?.json || {};
    
    return {
      input: input,
      item: firstItem,
      state: this.context ? this.context.getState() : {},
      count: this.getItemCount(input),
      hasData: (input?.length || 0) > 0
    };
  }

  /**
   * Safely evaluate JavaScript expression
   */
  private safeEvaluate(expression: string, context: any): boolean {
    // Create a function with limited scope
    const func = new Function(
      'input', 'item', 'state', 'count', 'hasData',
      `return ${expression}`
    );
    
    try {
      const result = func(
        context.input,
        context.item,
        context.state,
        context.count,
        context.hasData
      );
      
      // Convert to boolean if not already
      return result === 'false' ? false : Boolean(result);
    } catch (error) {
      console.error('Expression evaluation failed:', error);
      return false;
    }
  }

  /**
   * Check if input has tool calls
   */
  private hasToolCalls(input?: ExecutionItem[]): boolean {
    if (!input || input.length === 0) {
      return false;
    }
    
    for (const item of input) {
      if (item.json && typeof item.json === 'object') {
        const data = item.json as any;
        
        // Check various formats
        if (data.tool_calls && Array.isArray(data.tool_calls) && data.tool_calls.length > 0) {
          return true;
        }
        
        if (data.choices?.[0]?.message?.tool_calls?.length > 0) {
          return true;
        }
        
        if (data.message?.tool_calls?.length > 0) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Check if input has errors
   */
  private hasErrors(input?: ExecutionItem[]): boolean {
    if (!input) return false;
    
    return input.some(item => item.error !== undefined);
  }

  /**
   * Get count of input items
   */
  private getItemCount(input?: ExecutionItem[]): number {
    return input?.length || 0;
  }

  /**
   * Validate condition parameter
   */
  validate(): ValidationResult {
    const params = this.getResolvedParameters();
    
    if (!params.condition) {
      return {
        valid: false,
        errors: [{
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Condition parameter is required'
        }]
      };
    }
    
    return {
      valid: true
    };
  }
}