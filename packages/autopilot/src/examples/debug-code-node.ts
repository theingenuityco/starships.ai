/**
 * Debug Code Node Example
 * Shows what input looks like in the Code node
 */

import { Engine } from '@/engine/Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { Blueprint } from '@/types';

const debugBlueprint: Blueprint = {
  nodes: [
    {
      ref: 'start_1',
      type: 'start',
      name: 'Start',
      description: 'Start node',
      parameters: {},
    },
    {
      ref: 'debug_1',
      type: 'code',
      name: 'Debug Input',
      description: 'Show what input looks like',
      parameters: {
        code: `
          console.log('Input type:', typeof input);
          console.log('Input value:', input);
          console.log('Input keys:', input ? Object.keys(input) : 'none');
          
          return {
            inputType: typeof input,
            inputValue: input,
            inputKeys: input ? Object.keys(input) : [],
            message: 'Debug complete'
          };
        `,
        timeout: 3000,
      },
    },
    {
      ref: 'end_1',
      type: 'end',
      name: 'End',
      description: 'End node',
      parameters: {},
    },
  ],
  edges: [
    { ref: 'e1', from: 'start_1', to: 'debug_1' },
    { ref: 'e2', from: 'debug_1', to: 'end_1' },
  ],
  metadata: {},
};

export async function debugCodeNode() {
  console.log('🔍 Debug Code Node Input');

  const engine = new Engine({
    eventCallback: (event) => {
      if (event.type === 'node_completed' || event.type === 'node_failed') {
        console.log(`📢 Event: ${event.type}`);
      }
      return Promise.resolve();
    },
  });

  // Create execution with test input
  const execution = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle({ expression: '2 + 3 * 4', testField: 'test value' }));

  try {
    const result = await engine.executeBlueprint(debugBlueprint, execution);
    console.log('✅ Debug Result:', ExecutionItemUtils.unwrapSingle(result));
  } catch (error) {
    console.error('❌ Debug Error:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  debugCodeNode();
}
