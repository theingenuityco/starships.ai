/**
 * Debug Registry Test
 * 
 * Simple test to debug workflow node registry
 */

import { workflowNodeRegistry } from '../src/services/WorkflowNodeRegistry';

describe('Debug Registry', () => {
  test('should show registered handlers', () => {
    const stats = workflowNodeRegistry.getStats();
    
    // Check specific handlers
    const startHandler = workflowNodeRegistry.getHandler('start');
    const endHandler = workflowNodeRegistry.getHandler('end');
    const outputHandler = workflowNodeRegistry.getHandler('output');
    
    const info = {
      stats,
      startHandler: !!startHandler,
      endHandler: !!endHandler,
      outputHandler: !!outputHandler
    };
    
    throw new Error(`Registry info: ${JSON.stringify(info, null, 2)}`);
  });
});