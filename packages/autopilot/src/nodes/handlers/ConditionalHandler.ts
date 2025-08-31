/**
 * Conditional Node Handler
 * 
 * Conditional logic handler with JSONata
 * Uses BaseHandler pattern
 */

import { BaseHandler } from '../Handler';
import { Execution, NodeResult, ValidationResult, ConditionalNodeParameters, ValidationError, ValidationWarning } from '../../types';
import jsonata from 'jsonata';

export class ConditionalHandler extends BaseHandler {
  readonly type = 'conditional';

  async execute(execution: Execution) {
    const params = this.node.parameters as ConditionalNodeParameters;
    // Get data from source node
    const sourceResult = execution.executionResults.get(params.sourceNodeId);
    if (!sourceResult) {
      throw new Error(`Source node ${params.sourceNodeId} not found in execution results`);
    }

    try {
      // Evaluate conditions using JSONata
      for (const [conditionKey, expression] of Object.entries(params.conditions)) {
        const evaluator = jsonata(expression);
        const result = await evaluator.evaluate(sourceResult.data);
        
        // Check for explicit true result (not just truthy values)
        if (result === true) {
          const nodeResult: NodeResult = {
            nodeRef: this.node.ref,
            data: { conditionMet: conditionKey, sourceData: sourceResult.data },
            nextEdgeCondition: conditionKey
          };
          execution.executionResults.set(this.node.ref, nodeResult);
          return execution;
        }
      }

      // Use default condition if provided
      const defaultCondition = params.defaultCondition || 'default';
      const nodeResult: NodeResult = {
        nodeRef: this.node.ref,
        data: { conditionMet: defaultCondition, sourceData: sourceResult.data },
        nextEdgeCondition: defaultCondition
      };
      execution.executionResults.set(this.node.ref, nodeResult);
      return execution;

    } catch (error) {
      return this.createErrorResult(execution,
        `JSONata evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.node.parameters as ConditionalNodeParameters;

    if (!params.sourceNodeId) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Source node ID is required'
      ));
    }

    if (!params.conditions || Object.keys(params.conditions).length === 0) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'At least one condition is required'
      ));
    }

    // Validate JSONata expressions
    if (params.conditions) {
      for (const [key, expression] of Object.entries(params.conditions)) {
        try {
          jsonata(expression);
        } catch (error) {
          errors.push(this.createValidationError(
            'INVALID_JSONATA_EXPRESSION',
            `Invalid JSONata expression for condition '${key}': ${error instanceof Error ? error.message : 'Syntax error'}`
          ));
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'git-branch';
  }
}