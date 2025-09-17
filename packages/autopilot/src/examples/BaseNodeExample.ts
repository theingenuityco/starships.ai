/**
 * Example demonstrating how to create a custom node using BaseNode
 * This shows the (input): output pattern with params and execution
 */

import { BaseNode } from '../nodes/BaseNode';
import { ExecutionItem, ValidationResult, NodeHandlerOptions } from '../types';
import { BaseParams } from '../types/node-parameters';
import { ExecutionItemUtils } from '../utils/ExecutionItemUtils';

// Example parameters interface for a custom node - extending BaseParams
interface CalculatorParams extends BaseParams {
  operation: 'add' | 'multiply' | 'divide' | 'subtract';
  operand: number;
}

// Example custom node extending BaseNode
export class CalculatorNode extends BaseNode<CalculatorParams> {
  constructor(params: CalculatorParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  // Core (input): output execution function
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    try {
      const params = this.getParams();

      // Get input value - using ExecutionItemUtils directly
      const inputValue = ExecutionItemUtils.unwrapSingle(input);
      const numberInput = typeof inputValue === 'number' ? inputValue : Number(inputValue) || 0;

      // Perform calculation based on operation
      let result: number;
      switch (params.operation) {
        case 'add':
          result = numberInput + params.operand;
          break;
        case 'subtract':
          result = numberInput - params.operand;
          break;
        case 'multiply':
          result = numberInput * params.operand;
          break;
        case 'divide':
          if (params.operand === 0) {
            throw new Error('Division by zero is not allowed');
          }
          result = numberInput / params.operand;
          break;
        default:
          throw new Error(`Unknown operation: ${params.operation}`);
      }

      // Return result using ExecutionItemUtils directly
      return ExecutionItemUtils.wrapSingle(
        {
          operation: params.operation,
          input: numberInput,
          operand: params.operand,
          result: result,
        },
        input?.[0]
      );
    } catch (error) {
      // Use BaseNode error handling
      throw this.handleExecutionError(error, 'Calculator execution failed');
    }
  }

  // Validation using BaseNode helpers
  validate(): ValidationResult {
    const errors = [];
    const params = this.getParams();

    // Use BaseNode validation helpers
    const operationError = this.validateRequiredField(params.operation, 'Operation');
    if (operationError) errors.push(operationError);

    const operandError = this.validateRequiredField(params.operand, 'Operand');
    if (operandError) errors.push(operandError);

    // Custom validation
    const validOperations = ['add', 'subtract', 'multiply', 'divide'];
    if (params.operation && !validOperations.includes(params.operation)) {
      errors.push({
        code: 'INVALID_PARAMETERS' as const,
        message: `Operation must be one of: ${validOperations.join(', ')}`,
      });
    }

    if (typeof params.operand === 'number' && isNaN(params.operand)) {
      errors.push({
        code: 'INVALID_PARAMETERS' as const,
        message: 'Operand must be a valid number',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

// Example usage demonstration
export async function demonstrateBaseNodeUsage() {
  // Create a calculator node with parameters
  const addNode = new CalculatorNode({
    operation: 'add',
    operand: 10,
  });

  // Validate the node
  const validation = addNode.validate();
  console.log('Validation:', validation);

  // Execute with input data - demonstrating (input): output pattern
  const inputData = [{ json: 5 }]; // Input: 5
  const result = await addNode.execute(inputData);
  console.log('Execution result:', result);
  // Expected output: [{ json: { operation: 'add', input: 5, operand: 10, result: 15 } }]

  return result;
}

// Another example with different operation
export async function demonstrateChaining() {
  const multiplyNode = new CalculatorNode({
    operation: 'multiply',
    operand: 3,
  });

  const divideNode = new CalculatorNode({
    operation: 'divide',
    operand: 2,
  });

  // Chain operations: 10 * 3 = 30, then 30 / 2 = 15
  const step1 = await multiplyNode.execute([{ json: 10 }]);
  const step2 = await divideNode.execute(step1);

  console.log('Chained result:', step2);
  return step2;
}
