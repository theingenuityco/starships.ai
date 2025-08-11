/**
 * Setup Basic Handlers for Testing
 * 
 * Registers basic workflow node handlers for testing without complex dependencies.
 */

import { WorkflowNodeRegistry } from '../src/services/WorkflowNodeRegistry';
import { StartNodeHandler, EndNodeHandler, OutputNodeHandler } from '../src/services/BasicNodeHandlers';

/**
 * Setup basic handlers for testing
 */
export function setupBasicHandlers(registry: WorkflowNodeRegistry): void {
  // Clear any existing handlers
  registry.clear();
  
  // Register basic handlers
  registry.register(new StartNodeHandler());
  registry.register(new EndNodeHandler());
  registry.register(new OutputNodeHandler());
  
  console.log('Basic handlers registered for testing');
}

/**
 * Create a registry with only basic handlers
 */
export function createTestRegistry(): WorkflowNodeRegistry {
  const registry = new WorkflowNodeRegistry();
  setupBasicHandlers(registry);
  return registry;
}