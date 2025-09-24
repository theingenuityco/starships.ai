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
            // Safe mathematical expression evaluation with + - * / and parentheses
            const expression = input.expression;
            if (!expression || typeof expression !== 'string') {
              throw new Error('Expression is required and must be a string');
            }

            // Reject complex expressions BEFORE character validation
            const lower = expression.toLowerCase();
            if (
              lower.includes('math.') ||
              lower.includes('pow') ||
              lower.includes('sqrt') ||
              lower.includes('sin') ||
              lower.includes('cos')
            ) {
              throw new Error('Complex expressions not supported in this demo');
            }

            // Validate allowed characters
            const allowedChars = '0123456789+-*/.() ';
            for (let i = 0; i < expression.length; i++) {
              if (!allowedChars.includes(expression[i])) {
                throw new Error('Expression contains invalid characters. Only numbers and basic operators (+, -, *, /, parentheses) are allowed.');
              }
            }

            // Tokenize into numbers/operators/parentheses
            function tokenize(expr) {
              const tokens = [];
              let num = '';
              for (let i = 0; i < expr.length; i++) {
                const ch = expr[i];
                if ((ch >= '0' && ch <= '9') || ch === '.') {
                  num += ch;
                  continue;
                }
                if (num.length) {
                  tokens.push(num);
                  num = '';
                }
                if (ch === ' ') { continue; }
                if ('+-*/()'.includes(ch)) {
                  tokens.push(ch);
                } else {
                  // Should not happen due to validation above
                  throw new Error('Expression contains invalid characters. Only numbers and basic operators (+, -, *, /, parentheses) are allowed.');
                }
              }
              if (num.length) tokens.push(num);
              return tokens;
            }

            // Shunting Yard to produce Reverse Polish Notation (RPN)
            function toRPN(tokens) {
              const out = [];
              const ops = [];
              const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
              const isOp = (t) => Object.prototype.hasOwnProperty.call(prec, t);

              for (const t of tokens) {
                if (!isNaN(Number(t))) {
                  out.push(t);
                } else if (isOp(t)) {
                  while (ops.length && isOp(ops[ops.length - 1]) && prec[ops[ops.length - 1]] >= prec[t]) {
                    out.push(ops.pop());
                  }
                  ops.push(t);
                } else if (t === '(') {
                  ops.push(t);
                } else if (t === ')') {
                  while (ops.length && ops[ops.length - 1] !== '(') {
                    out.push(ops.pop());
                  }
                  if (!ops.length || ops.pop() !== '(') {
                    throw new Error('Invalid mathematical expression: mismatched parentheses');
                  }
                }
              }

              while (ops.length) {
                const op = ops.pop();
                if (op === '(' || op === ')') throw new Error('Invalid mathematical expression: mismatched parentheses');
                out.push(op);
              }
              return out;
            }

            // Evaluate RPN
            function evalRPN(rpn) {
              const st = [];
              for (const t of rpn) {
                const n = Number(t);
                if (!isNaN(n)) {
                  st.push(n);
                } else if ('+-*/'.includes(t)) {
                  const b = st.pop();
                  const a = st.pop();
                  if (a === undefined || b === undefined) throw new Error('Invalid mathematical expression: insufficient operands');
                  let v;
                  switch (t) {
                    case '+': v = a + b; break;
                    case '-': v = a - b; break;
                    case '*': v = a * b; break;
                    case '/': v = a / b; break; // JS yields Infinity for divide-by-zero
                  }
                  st.push(v);
                } else {
                  throw new Error('Invalid mathematical expression');
                }
              }
              if (st.length !== 1) throw new Error('Invalid mathematical expression');
              return st[0];
            }

            try {
              const tokens = tokenize(expression);
              const rpn = toRPN(tokens);
              const result = evalRPN(rpn);

              if (typeof result !== 'number' || !isFinite(result)) {
                // Allow Infinity explicitly (division by zero)
                if (result !== Infinity && result !== -Infinity) {
                  throw new Error('Expression did not evaluate to a valid number');
                }
              }

              return { expression, result, type: 'calculation' };
            } catch (error) {
              const msg = error && error.message ? error.message : String(error);
              throw new Error('Invalid mathematical expression: ' + msg);
            }
          `,
          timeout: 5000,
        },
      },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: { output: '{{ $input() }}' } },
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
