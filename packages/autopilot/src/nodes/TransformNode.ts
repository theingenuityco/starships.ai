import { BaseNodeHandler } from './BaseNodeHandler';
import { ExecutionItem, ValidationResult } from '@/types';

/**
 * TransformNode - Transform and manipulate data
 * Supports various transformation operations
 */
export class TransformNode extends BaseNodeHandler {
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getResolvedParameters();
    const operation = params.operation as string || 'passthrough';
    
    switch (operation) {
      case 'passthrough':
        return input || [];
        
      case 'map':
        return this.mapTransform(input, params);
        
      case 'filter':
        return this.filterTransform(input, params);
        
      case 'reduce':
        return this.reduceTransform(input, params);
        
      case 'merge':
        return this.mergeTransform(input, params);
        
      case 'split':
        return this.splitTransform(input, params);
        
      case 'extract':
        return this.extractTransform(input, params);
        
      case 'template':
        return this.templateTransform(input, params);
        
      case 'jsonParse':
        return this.jsonParseTransform(input);
        
      case 'jsonStringify':
        return this.jsonStringifyTransform(input);
        
      default:
        // Pass through for unknown operations
        return input || [];
    }
  }

  /**
   * Map transformation - transform each item
   */
  private mapTransform(input?: ExecutionItem[], params?: any): ExecutionItem[] {
    if (!input || input.length === 0) {
      return [];
    }
    
    const expression = params.expression as string;
    if (!expression) {
      return input;
    }
    
    return input.map(item => {
      const transformed = this.applyExpression(item.json, expression);
      return this.createExecutionItem(transformed);
    });
  }

  /**
   * Filter transformation - filter items based on condition
   */
  private filterTransform(input?: ExecutionItem[], params?: any): ExecutionItem[] {
    if (!input || input.length === 0) {
      return [];
    }
    
    const condition = params.condition as string;
    if (!condition) {
      return input;
    }
    
    return input.filter(item => {
      return this.evaluateCondition(item.json, condition);
    });
  }

  /**
   * Reduce transformation - aggregate items into single result
   */
  private reduceTransform(input?: ExecutionItem[], params?: any): ExecutionItem[] {
    if (!input || input.length === 0) {
      return [];
    }
    
    const reducer = params.reducer as string || 'concat';
    let result: any;
    
    switch (reducer) {
      case 'concat':
        result = input.map(item => item.json);
        break;
        
      case 'sum':
        result = input.reduce((acc, item) => {
          const value = this.getNumericValue(item.json, params.field);
          return acc + value;
        }, 0);
        break;
        
      case 'average':
        const sum = input.reduce((acc, item) => {
          const value = this.getNumericValue(item.json, params.field);
          return acc + value;
        }, 0);
        result = sum / input.length;
        break;
        
      case 'count':
        result = input.length;
        break;
        
      case 'first':
        result = input[0]?.json;
        break;
        
      case 'last':
        result = input[input.length - 1]?.json;
        break;
        
      default:
        result = input.map(item => item.json);
    }
    
    return [this.createExecutionItem(result)];
  }

  /**
   * Merge transformation - merge multiple items into one
   */
  private mergeTransform(input?: ExecutionItem[], params?: any): ExecutionItem[] {
    if (!input || input.length === 0) {
      return [];
    }
    
    const strategy = params.strategy as string || 'shallow';
    let merged: any = {};
    
    for (const item of input) {
      if (typeof item.json === 'object' && item.json !== null) {
        if (strategy === 'deep') {
          merged = this.deepMerge(merged, item.json);
        } else {
          merged = { ...merged, ...(item.json as any) };
        }
      }
    }
    
    return [this.createExecutionItem(merged)];
  }

  /**
   * Split transformation - split single item into multiple
   */
  private splitTransform(input?: ExecutionItem[], params?: any): ExecutionItem[] {
    if (!input || input.length === 0) {
      return [];
    }
    
    const field = params.field as string;
    const results: ExecutionItem[] = [];
    
    for (const item of input) {
      const value = field ? this.getFieldValue(item.json, field) : item.json;
      
      if (Array.isArray(value)) {
        // Split array into individual items
        for (const element of value) {
          results.push(this.createExecutionItem(element));
        }
      } else if (typeof value === 'string' && params.delimiter) {
        // Split string by delimiter
        const parts = value.split(params.delimiter as string);
        for (const part of parts) {
          results.push(this.createExecutionItem(part.trim()));
        }
      } else {
        // Can't split, return as-is
        results.push(item);
      }
    }
    
    return results;
  }

  /**
   * Extract transformation - extract specific fields
   */
  private extractTransform(input?: ExecutionItem[], params?: any): ExecutionItem[] {
    if (!input || input.length === 0) {
      return [];
    }
    
    const fields = params.fields as string[] | string;
    if (!fields) {
      return input;
    }
    
    const fieldList = Array.isArray(fields) ? fields : [fields];
    
    return input.map(item => {
      const extracted: any = {};
      
      for (const field of fieldList) {
        const value = this.getFieldValue(item.json, field);
        if (value !== undefined) {
          this.setFieldValue(extracted, field, value);
        }
      }
      
      return this.createExecutionItem(extracted);
    });
  }

  /**
   * Template transformation - apply template to data
   */
  private templateTransform(input?: ExecutionItem[], params?: any): ExecutionItem[] {
    const template = params.template as string;
    if (!template) {
      return input || [];
    }
    
    if (!input || input.length === 0) {
      // Apply template without input data
      const result = this.applyTemplate(template, {});
      return [this.createExecutionItem(result)];
    }
    
    return input.map(item => {
      const result = this.applyTemplate(template, item.json);
      return this.createExecutionItem(result);
    });
  }

  /**
   * JSON parse transformation
   */
  private jsonParseTransform(input?: ExecutionItem[]): ExecutionItem[] {
    if (!input || input.length === 0) {
      return [];
    }
    
    return input.map(item => {
      try {
        const parsed = typeof item.json === 'string' 
          ? JSON.parse(item.json)
          : item.json;
        return this.createExecutionItem(parsed);
      } catch (error) {
        return this.createExecutionItem({
          error: 'Failed to parse JSON',
          original: item.json
        });
      }
    });
  }

  /**
   * JSON stringify transformation
   */
  private jsonStringifyTransform(input?: ExecutionItem[]): ExecutionItem[] {
    if (!input || input.length === 0) {
      return [];
    }
    
    return input.map(item => {
      const stringified = typeof item.json === 'string'
        ? item.json
        : JSON.stringify(item.json, null, 2);
      return this.createExecutionItem(stringified);
    });
  }

  /**
   * Apply expression to data
   */
  private applyExpression(data: any, expression: string): any {
    // Simple property access
    if (expression.startsWith('.')) {
      return this.getFieldValue(data, expression.substring(1));
    }
    
    // JavaScript expression
    try {
      const func = new Function('data', `return ${expression}`);
      return func(data);
    } catch (error) {
      console.error('Expression evaluation failed:', error);
      return data;
    }
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(data: any, condition: string): boolean {
    try {
      const func = new Function('data', `return ${condition}`);
      return Boolean(func(data));
    } catch (error) {
      console.error('Condition evaluation failed:', error);
      return false;
    }
  }

  /**
   * Get field value using dot notation
   */
  private getFieldValue(obj: any, field: string): any {
    const parts = field.split('.');
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
   * Set field value using dot notation
   */
  private setFieldValue(obj: any, field: string, value: any): void {
    const parts = field.split('.');
    const lastPart = parts.pop()!;
    
    let current = obj;
    for (const part of parts) {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[lastPart] = value;
  }

  /**
   * Get numeric value from data
   */
  private getNumericValue(data: any, field?: string): number {
    const value = field ? this.getFieldValue(data, field) : data;
    return Number(value) || 0;
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Apply template to data
   */
  private applyTemplate(template: string, data: any): any {
    let result = template;
    
    // Replace {{field}} placeholders
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
      const value = this.getFieldValue(data, field.trim());
      return value !== undefined ? String(value) : match;
    });
    
    return result;
  }

  /**
   * Validate transform parameters
   */
  validate(): ValidationResult {
    const params = this.getResolvedParameters();
    const operation = params.operation as string;
    
    if (!operation) {
      // Default to passthrough if no operation specified
      return { valid: true };
    }
    
    // Validate specific operations
    if (operation === 'map' && !params.expression) {
      return {
        valid: false,
        errors: [{
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Expression is required for map operation'
        }]
      };
    }
    
    if (operation === 'filter' && !params.condition) {
      return {
        valid: false,
        errors: [{
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Condition is required for filter operation'
        }]
      };
    }
    
    if (operation === 'template' && !params.template) {
      return {
        valid: false,
        errors: [{
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Template is required for template operation'
        }]
      };
    }
    
    return { valid: true };
  }
}