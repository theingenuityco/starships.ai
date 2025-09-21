/**
 * Simple Working Code Node Example
 * Demonstrates functional Code node usage
 */

import { Engine } from '@/engine/Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { Blueprint } from '@/types';

// Simple blueprint that accesses state instead of input
const simpleCalculatorBlueprint: Blueprint = {
  nodes: [
    {
      ref: 'start_1',
      type: 'start',
      name: 'Start',
      description: 'Start node',
      parameters: {},
    },
    {
      ref: 'calc_1',
      type: 'code',
      name: 'Simple Math',
      description: 'Do simple calculation',
      parameters: {
        code: `
          // Simple hardcoded calculation for demonstration
          const result = 2 + 3 * 4; // 14
          
          return {
            calculation: '2 + 3 * 4',
            result: result,
            timestamp: new Date().toISOString(),
            message: 'Calculation completed successfully'
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
    { ref: 'e1', from: 'start_1', to: 'calc_1' },
    { ref: 'e2', from: 'calc_1', to: 'end_1' },
  ],
  metadata: {},
};

// Blueprint that uses state data
const stateBasedBlueprint: Blueprint = {
  nodes: [
    {
      ref: 'start_1',
      type: 'start',
      name: 'Start',
      description: 'Start node',
      parameters: {},
    },
    {
      ref: 'calc_1',
      type: 'code',
      name: 'State Calculator',
      description: 'Calculate using state data',
      parameters: {
        code: `
          // Access state data instead of input
          const expression = state.expression || '5 + 3';
          console.log('Using expression from state:', expression);
          
          // Simple calculation based on state
          let result;
          if (expression === '5 + 3') {
            result = 8;
          } else if (expression === '2 + 3 * 4') {
            result = 14;
          } else {
            result = 42; // default
          }
          
          return {
            expression: expression,
            result: result,
            source: 'state',
            timestamp: new Date().toISOString()
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
    { ref: 'e1', from: 'start_1', to: 'calc_1' },
    { ref: 'e2', from: 'calc_1', to: 'end_1' },
  ],
  metadata: {},
};

export async function demonstrateSimpleCode() {
  console.log('🧮 Simple Code Node Example');

  const engine = new Engine({
    eventCallback: (event) => {
      if (event.type.includes('completed') || event.type.includes('failed')) {
        console.log(`📢 ${event.type}`);
      }
      return Promise.resolve();
    },
  });

  const execution = ExecutionItemUtils.createExecution();

  try {
    const result = await engine.executeBlueprint(simpleCalculatorBlueprint, execution);
    const finalResult = ExecutionItemUtils.unwrapSingle(result);

    // Extract the actual calculation result from the workflow results
    if (Array.isArray(finalResult)) {
      const calcResult = finalResult.find((r: Record<string, unknown>) => r.nodeRef === 'calc_1');
      if (calcResult && typeof calcResult === 'object' && calcResult.items && Array.isArray(calcResult.items) && calcResult.items[0]) {
        const item = calcResult.items[0] as Record<string, unknown>;
        if (item.json) {
          console.log('✅ Calculation Result:', item.json);
        }
      }
    } else {
      console.log('✅ Full Result:', finalResult);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

export async function demonstrateStateBasedCode() {
  console.log('\n📊 State-Based Code Node Example');

  const engine = new Engine();
  const execution = ExecutionItemUtils.createExecution();

  // Set some state data
  execution.state = { expression: '2 + 3 * 4' };

  try {
    const result = await engine.executeBlueprint(stateBasedBlueprint, execution);
    const finalResult = ExecutionItemUtils.unwrapSingle(result);

    // Extract the actual calculation result
    if (Array.isArray(finalResult)) {
      const calcResult = finalResult.find((r: Record<string, unknown>) => r.nodeRef === 'calc_1');
      if (calcResult && typeof calcResult === 'object' && calcResult.items && Array.isArray(calcResult.items) && calcResult.items[0]) {
        const item = calcResult.items[0] as Record<string, unknown>;
        if (item.json) {
          console.log('✅ State Result:', item.json);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  (async () => {
    await demonstrateSimpleCode();
    await demonstrateStateBasedCode();
  })();
}
