/**
 * Node Helper Utilities
 *
 * Helper functions to make it easy for nodes to work with ExecutionItem arrays
 * while maintaining backward compatibility with simple data processing
 */

import { ExecutionItem } from '@/types';

export class NodeHelpers {
  /**
   * Extract simple data from the first item (for nodes that process single values)
   */
  static getSingleInput(items?: ExecutionItem[]): unknown {
    return items?.[0]?.json;
  }

  /**
   * Create a single output item from simple data
   */
  static createSingleOutput(data: unknown, sourceItem?: ExecutionItem): ExecutionItem[] {
    return [
      {
        json: data,
        pairedItem: sourceItem?.pairedItem || { item: 0 },
        binary: sourceItem?.binary,
      },
    ];
  }

  /**
   * Extract all data from items array (for nodes that process multiple values)
   */
  static getAllInputs(items?: ExecutionItem[]): unknown[] {
    return items?.map((item) => item.json) || [];
  }

  /**
   * Create multiple output items from an array of data
   */
  static createMultipleOutputs(dataArray: unknown[], sourceItems?: ExecutionItem[]): ExecutionItem[] {
    return dataArray.map((data, index) => ({
      json: data,
      pairedItem: { item: index },
      binary: sourceItems?.[index]?.binary,
    }));
  }

  /**
   * Create error item for failed processing
   */
  static createErrorOutput(error: string, sourceItem?: ExecutionItem): ExecutionItem[] {
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
   * Filter out items with errors
   */
  static filterErrors(items: ExecutionItem[]): ExecutionItem[] {
    return items.filter((item) => !item.error);
  }

  /**
   * Get items with errors
   */
  static getErrors(items: ExecutionItem[]): ExecutionItem[] {
    return items.filter((item) => item.error);
  }

  /**
   * Check if any items have errors
   */
  static hasErrors(items: ExecutionItem[]): boolean {
    return items.some((item) => item.error);
  }
}
