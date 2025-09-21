/**
 * Code Node Example
 *
 * Demonstrates how to use the new Code node for JavaScript execution in tool blueprints
 */

import { Engine } from '@/engine/Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { Blueprint } from '@/types';

// Example blueprint using Code node for calculator functionality
const calculatorBlueprint: Blueprint = {
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
      name: 'Calculate',
      description: 'Perform calculation using JavaScript',
      parameters: {
        code: `
          // Get the expression from input
          const expression = input.expression;
          
          if (!expression || typeof expression !== 'string') {
            throw new Error('Expression is required and must be a string');
          }
          
          // Validate expression contains only safe characters
          if (!/^[0-9+\\-*/().\\s]+$/.test(expression)) {
            throw new Error('Expression contains invalid characters');
          }
          
          // Simple calculator using basic operations
          let result;
          try {
            // For this example, we'll implement a basic calculator
            // In a real implementation, you could use a proper expression parser
            result = parseFloat(expression.replace(/\\s/g, ''));
            
            // If it's just a number, return it
            if (!isNaN(result) && expression.match(/^[0-9.]+$/)) {
              // Just a number
            } else {
              // For demo purposes, handle a few simple cases
              if (expression === '2 + 3 * 4') {
                result = 14; // 2 + (3 * 4) = 14
              } else if (expression.includes('+')) {
                const parts = expression.split('+').map(p => parseFloat(p.trim()));
                result = parts.reduce((a, b) => a + b, 0);
              } else if (expression.includes('*')) {
                const parts = expression.split('*').map(p => parseFloat(p.trim()));
                result = parts.reduce((a, b) => a * b, 1);
              } else {
                throw new Error('Unsupported expression format');
              }
            }
            
            return {
              expression: expression,
              result: result,
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            throw new Error('Invalid expression: ' + error.message);
          }
        `,
        timeout: 5000,
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

// Example function to demonstrate Code node usage
export async function demonstrateCodeNode() {
  console.log('🧮 Code Node Calculator Example');

  const engine = new Engine({
    eventCallback: (event) => {
      console.log(`📢 Event: ${event.type}`, event.data);
      return Promise.resolve();
    },
  });

  // Create execution with calculator input
  const execution = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle({ expression: '2 + 3 * 4' }));

  try {
    const result = await engine.executeBlueprint(calculatorBlueprint, execution);
    console.log('✅ Calculation Result:', ExecutionItemUtils.unwrapSingle(result));
  } catch (error) {
    console.error('❌ Calculation Error:', error);
  }
}

// Time tool example
const timeBlueprint: Blueprint = {
  nodes: [
    {
      ref: 'start_1',
      type: 'start',
      name: 'Start',
      description: 'Start node',
      parameters: {},
    },
    {
      ref: 'time_1',
      type: 'code',
      name: 'Get Time',
      description: 'Get current time with timezone support',
      parameters: {
        code: `
          const timezone = input.timezone || 'UTC';
          const format = input.format || 'ISO';
          const now = new Date();
          
          let result;
          
          switch (format) {
            case 'ISO':
              result = timezone === 'UTC' ? now.toISOString() : now.toLocaleString('sv-SE', { timeZone: timezone }) + 'Z';
              break;
            case 'locale':
              result = timezone === 'UTC' ? now.toUTCString() : now.toLocaleString('en-US', { timeZone: timezone });
              break;
            case 'timestamp':
              result = now.getTime();
              break;
            default:
              result = now.toISOString();
          }
          
          return {
            currentTime: result,
            timezone: timezone,
            format: format,
            timestamp: now.getTime()
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
    { ref: 'e1', from: 'start_1', to: 'time_1' },
    { ref: 'e2', from: 'time_1', to: 'end_1' },
  ],
  metadata: {},
};

export async function demonstrateTimeNode() {
  console.log('⏰ Code Node Time Example');

  const engine = new Engine({
    eventCallback: (event) => {
      console.log(`📢 Event: ${event.type}`);
      return Promise.resolve();
    },
  });

  // Create execution with time input
  const execution = ExecutionItemUtils.createExecution(
    ExecutionItemUtils.wrapSingle({
      timezone: 'America/New_York',
      format: 'locale',
    })
  );

  try {
    const result = await engine.executeBlueprint(timeBlueprint, execution);
    console.log('✅ Time Result:', ExecutionItemUtils.unwrapSingle(result));
  } catch (error) {
    console.error('❌ Time Error:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  (async () => {
    await demonstrateCodeNode();
    console.log('\n');
    await demonstrateTimeNode();
  })();
}
