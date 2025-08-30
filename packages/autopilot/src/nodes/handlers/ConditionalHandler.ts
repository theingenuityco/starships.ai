/**
 * Conditional Node Handler
 * 
 * Conditional logic handler with JSONata
 */

import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, ConditionalNodeParameters } from '../../types';
import * as jsonata from 'jsonata';

export class ConditionalHandler implements Handler {
  readonly type = 'conditional';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as ConditionalNodeParameters;
    
    // Get data from source node
    const sourceResult = context.previousResults.get(params.sourceNodeId);
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
          return {
            nodeId: node.id,
            success: true,
            data: { conditionMet: conditionKey, sourceData: sourceResult.data },
            nextEdgeCondition: conditionKey,
            executedAt: new Date().toISOString(),
            duration: 10
          };
        }
      }

      // Use default condition if provided
      const defaultCondition = params.defaultCondition || 'default';
      return {
        nodeId: node.id,
        success: true,
        data: { conditionMet: defaultCondition, sourceData: sourceResult.data },
        nextEdgeCondition: defaultCondition,
        executedAt: new Date().toISOString(),
        duration: 10
      };

    } catch (error) {
      return {
        nodeId: node.id,
        success: false,
        error: `JSONata evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executedAt: new Date().toISOString(),
        duration: 10
      };
    }
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as ConditionalNodeParameters;
    const errors = [];

    if (!params.sourceNodeId) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Source node ID is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.conditions || Object.keys(params.conditions).length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one condition is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    // Validate JSONata expressions
    if (params.conditions) {
      for (const [key, expression] of Object.entries(params.conditions)) {
        try {
          jsonata(expression);
        } catch (error) {
          errors.push({
            code: 'INVALID_JSONATA_EXPRESSION',
            message: `Invalid JSONata expression for condition '${key}': ${error instanceof Error ? error.message : 'Syntax error'}`,
            nodeId: node.id,
            severity: 'error' as const
          });
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