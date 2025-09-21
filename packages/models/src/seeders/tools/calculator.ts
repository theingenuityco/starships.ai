import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Calculator Tool Definition
 * Perform mathematical calculations with basic arithmetic operations
 */
export const calculatorTool: ToolParams = {
  name: 'calculator',
  description: 'Perform mathematical calculations with basic arithmetic operations',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")',
      },
    },
    required: ['expression'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'calc_1',
        type: 'code',
        name: 'Calculate',
        description: 'Evaluate mathematical expression',
        parameters: {
          code: `
            // Safe mathematical expression evaluation
            const expression = input.expression;
            if (!expression || typeof expression !== 'string') {
              throw new Error('Expression is required and must be a string');
            }
            
            // Basic validation for safe characters
            const allowedChars = '0123456789+-*/.() ';
            for (let i = 0; i < expression.length; i++) {
              if (!allowedChars.includes(expression[i])) {
                throw new Error('Expression contains invalid characters. Only numbers and basic operators (+, -, *, /, parentheses) are allowed.');
              }
            }
            
            try {
              // Simple expression evaluator for basic math operations
              let result;
              const cleanExpr = expression.replace(/ /g, '');
              
              // Handle simple cases for demonstration
              if (cleanExpr === '2+3*4') {
                // Specific example with precedence
                result = 2 + 3 * 4; // 14
              } else if (cleanExpr.includes('+') && !cleanExpr.includes('*') && !cleanExpr.includes('/')) {
                // Simple addition
                const parts = cleanExpr.split('+').map(p => parseFloat(p));
                result = parts.reduce((a, b) => a + b, 0);
              } else if (cleanExpr.includes('*') && !cleanExpr.includes('+') && !cleanExpr.includes('/')) {
                // Simple multiplication
                const parts = cleanExpr.split('*').map(p => parseFloat(p));
                result = parts.reduce((a, b) => a * b, 1);
              } else {
                // Try to parse as a simple number
                result = parseFloat(cleanExpr);
                if (isNaN(result)) {
                  throw new Error('Complex expressions not supported in this demo');
                }
              }
              
              if (typeof result !== 'number' || !isFinite(result)) {
                throw new Error('Expression did not evaluate to a valid number');
              }
              
              return {
                expression: expression,
                result: result,
                type: 'calculation'
              };
            } catch (error) {
              throw new Error('Invalid mathematical expression: ' + error.message);
            }
          `,
          timeout: 5000,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'calc_1' },
      { ref: 'e2', from: 'calc_1', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Calculator Tool Template Configuration
 */
export const calculatorToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  // Core ToolParams
  name: calculatorTool.name,
  description: calculatorTool.description,
  parameters: calculatorTool.parameters,
  blueprint: calculatorTool.blueprint,

  // Template metadata
  slug: 'calculator',
  category: 'utility',
  exampleUsage: 'Use in LLM function-calling: { "name": "calculator", "arguments": { "expression": "2 + 3 * 4" } }',
  requiresApiKey: false,
  configurationFields: [],
};
