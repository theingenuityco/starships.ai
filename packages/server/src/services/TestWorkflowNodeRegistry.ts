/**
 * Test Workflow Node Registry
 * 
 * Simplified registry for testing that only loads basic handlers without complex dependencies.
 */

import { WorkflowNodeRegistry } from './WorkflowNodeRegistry';

/**
 * Test-specific registry that only loads basic handlers
 */
export class TestWorkflowNodeRegistry extends WorkflowNodeRegistry {
  /**
   * Initialize only basic handlers for testing
   */
  protected initializeBuiltInHandlers(): void {
    try {
      // Import only basic handlers without complex dependencies
      const { StartNodeHandler, EndNodeHandler, OutputNodeHandler } = require('./BasicNodeHandlers');
      
      this.register(new StartNodeHandler());
      this.register(new EndNodeHandler());
      this.register(new OutputNodeHandler());
      
      console.log('TestWorkflowNodeRegistry initialized with basic handlers only');
    } catch (error) {
      console.error('Failed to load basic handlers:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance for testing
 */
export const testWorkflowNodeRegistry = new TestWorkflowNodeRegistry();