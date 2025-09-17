/**
 * Execution Item Utilities
 *
 * Utility functions to make it easy for nodes to work with ExecutionItem arrays
 * while maintaining backward compatibility with simple data processing
 */

import { ExecutionItem, Execution } from '@/types';

export class ExecutionItemUtils {
  /**
   * Unwrap data from the first ExecutionItem (for nodes that process single values)
   */
  static unwrapSingle(items?: ExecutionItem[]): unknown {
    return items?.[0]?.json;
  }

  /**
   * Wrap simple data into a single ExecutionItem
   */
  static wrapSingle(data: unknown, sourceItem?: ExecutionItem): ExecutionItem[] {
    return [
      {
        json: data,
        pairedItem: sourceItem?.pairedItem || { item: 0 },
        binary: sourceItem?.binary,
      },
    ];
  }

  /**
   * Unwrap data from all ExecutionItems (for nodes that process multiple values)
   */
  static unwrapAll(items?: ExecutionItem[]): unknown[] {
    return items?.map((item) => item.json) || [];
  }

  /**
   * Wrap multiple data values into ExecutionItem array
   */
  static wrapMultiple(dataArray: unknown[], sourceItems?: ExecutionItem[]): ExecutionItem[] {
    return dataArray.map((data, index) => ({
      json: data,
      pairedItem: { item: index },
      binary: sourceItems?.[index]?.binary,
    }));
  }

  /**
   * Wrap error message into ExecutionItem for failed processing
   */
  static wrapError(error: string, sourceItem?: ExecutionItem): ExecutionItem[] {
    return [
      {
        json: undefined,
        error,
        pairedItem: sourceItem?.pairedItem || { item: 0 },
      },
    ];
  }

  /**
   * Process items with error handling (for nodes that want to process each item individually)
   */
  static async processItems<T>(items: ExecutionItem[] | undefined, processor: (data: unknown) => Promise<T>): Promise<ExecutionItem[]> {
    if (!items?.length) {
      return [];
    }

    const results: ExecutionItem[] = [];

    for (const item of items) {
      try {
        const result = await processor(item.json);
        results.push({
          json: result,
          pairedItem: item.pairedItem,
          binary: item.binary,
        });
      } catch (error) {
        results.push({
          json: undefined,
          error: error instanceof Error ? error.message : String(error),
          pairedItem: item.pairedItem,
        });
      }
    }

    return results;
  }

  /**
   * Filter out ExecutionItems with errors
   */
  static filterErrors(items: ExecutionItem[]): ExecutionItem[] {
    return items.filter((item) => !item.error);
  }

  /**
   * Get ExecutionItems that contain errors
   */
  static getErrors(items: ExecutionItem[]): ExecutionItem[] {
    return items.filter((item) => item.error);
  }

  /**
   * Check if any ExecutionItems have errors
   */
  static hasErrors(items: ExecutionItem[]): boolean {
    return items.some((item) => item.error);
  }

  /**
   * Create a new execution context with optional initial input
   * This is a common pattern used when nodes need to execute nested blueprints
   */
  static createExecution(input?: ExecutionItem[]): Execution {
    const execution: Execution = {
      status: 'not_started',
      state: {},
      nodeOutputs: {},
    };

    // Set initial input for the blueprint if provided
    if (input && input.length > 0) {
      execution.nodeOutputs['__initial__'] = input;
    }

    return execution;
  }
}
