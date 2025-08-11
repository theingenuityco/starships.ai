/**
 * Conditional Node Handler
 * 
 * Handles execution of conditional nodes within the workflow DSL system.
 * Uses JSONata for safe expression evaluation and data-driven routing.
 */

import jsonata from 'jsonata';
import {
  WorkflowDSLNode,
  WorkflowNodeResult,
  WorkflowValidationResult,
  WorkflowExecutionContext,
  ConditionalNodeParameters
} from '@starships/protocol';
import { BaseWorkflowNodeHandler } from './WorkflowNodeRegistry';
import { WORKFLOW_CONFIG } from '../constants/workflow';
import { Logger } from '../utils/logger';

/**
 * Handler for executing conditional nodes
 */
export class ConditionalNodeHandler extends BaseWorkflowNodeHandler {
  readonly type = 'conditional';
  private logger = Logger.getInstance();

  /**
   * Execute the conditional node
   */
  async execute(
    node: WorkflowDSLNode,
    context: WorkflowExecutionContext
  ): Promise<WorkflowNodeResult> {
    const startTime = Date.now();
    const logContext = {
      nodeId: node.id,
      nodeName: node.name,
      expeditionId: context.expeditionId,
      workflowId: context.workflowId
    };

    this.logger.info('Starting conditional node execution', logContext);

    try {
      // Validate node parameters
      const validation = this.validate(node);
      if (!validation.valid) {
        const errors = validation.errors.map(e => e.message).join(', ');
        return this.createErrorResult(node, `Validation failed: ${errors}`);
      }

      const params = node.parameters as ConditionalNodeParameters;
      
      // Get data from source node
      const sourceResult = context.previousResults.get(params.sourceNodeId);
      if (!sourceResult) {
        return this.createErrorResult(
          node, 
          `Source node result not found: ${params.sourceNodeId}`
        );
      }

      this.logger.info('Source node data found, evaluating expressions', {
        ...logContext,
        sourceNodeId: params.sourceNodeId,
        hasSourceData: !!sourceResult.data
      });

      // Evaluate the main expression
      const expressionResult = await this.evaluateExpression(
        params.expression,
        sourceResult.data || {},
        'main expression'
      );

      // Check conditions in order
      const conditionResults = [];
      for (const [conditionKey, conditionExpression] of Object.entries(params.conditions)) {
        try {
          const conditionMet = await this.evaluateCondition(
            conditionExpression,
            expressionResult,
            conditionKey
          );

          conditionResults.push({
            key: conditionKey,
            expression: conditionExpression,
            result: conditionMet
          });

          if (conditionMet) {
            this.logger.info('Condition met, routing to edge', {
              ...logContext,
              conditionKey,
              expressionResult
            });

            const duration = Date.now() - startTime;
            return {
              nodeId: node.id,
              success: true,
              data: { 
                value: expressionResult, 
                condition: conditionKey,
                evaluationResults: conditionResults
              },
              nextEdgeCondition: conditionKey,
              executedAt: new Date().toISOString(),
              duration
            };
          }
        } catch (conditionError) {
          this.logger.warn('Condition evaluation failed, skipping', {
            ...logContext,
            conditionKey,
            error: conditionError instanceof Error ? conditionError.message : String(conditionError)
          });
          
          conditionResults.push({
            key: conditionKey,
            expression: conditionExpression,
            result: false,
            error: conditionError instanceof Error ? conditionError.message : String(conditionError)
          });
        }
      }

      // No conditions met, use default
      const defaultCondition = params.defaultCondition || 'default';
      
      this.logger.info('No conditions met, using default routing', {
        ...logContext,
        defaultCondition,
        expressionResult
      });

      const duration = Date.now() - startTime;
      return {
        nodeId: node.id,
        success: true,
        data: { 
          value: expressionResult, 
          condition: defaultCondition,
          evaluationResults: conditionResults
        },
        nextEdgeCondition: defaultCondition,
        executedAt: new Date().toISOString(),
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('Conditional node execution failed', {
        ...logContext,
        error: errorMessage,
        duration
      });

      return {
        nodeId: node.id,
        success: false,
        error: errorMessage,
        executedAt: new Date().toISOString(),
        duration
      };
    }
  }

  /**
   * Evaluate a JSONata expression safely with timeout
   */
  private async evaluateExpression(
    expression: string,
    data: any,
    context: string
  ): Promise<any> {
    try {
      const query = jsonata(expression);
      
      // Implement timeout using Promise.race
      const evaluationPromise = query.evaluate(data);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Expression evaluation timeout after ${WORKFLOW_CONFIG.JSONATA_EXPRESSION_TIMEOUT_MS}ms`));
        }, WORKFLOW_CONFIG.JSONATA_EXPRESSION_TIMEOUT_MS);
      });

      const result = await Promise.race([evaluationPromise, timeoutPromise]);
      
      this.logger.debug('JSONata expression evaluated', {
        context,
        expression,
        result: typeof result,
        resultValue: typeof result === 'object' ? JSON.stringify(result) : result
      });
      
      return result;
    } catch (error) {
      this.logger.error('JSONata expression evaluation failed', {
        context,
        expression,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`${context} evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Evaluate a condition expression with timeout
   */
  private async evaluateCondition(
    conditionExpression: string,
    expressionResult: any,
    conditionKey: string
  ): Promise<boolean> {
    try {
      const query = jsonata(conditionExpression);
      
      // Provide both the expression result and original result for flexibility
      const conditionContext = {
        result: expressionResult,
        value: expressionResult
      };

      // Implement timeout using Promise.race
      const evaluationPromise = query.evaluate(conditionContext);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Condition evaluation timeout after ${WORKFLOW_CONFIG.JSONATA_EXPRESSION_TIMEOUT_MS}ms`));
        }, WORKFLOW_CONFIG.JSONATA_EXPRESSION_TIMEOUT_MS);
      });

      const conditionResult = await Promise.race([evaluationPromise, timeoutPromise]);
      
      // Convert result to boolean
      const booleanResult = Boolean(conditionResult);
      
      this.logger.debug('Condition evaluated', {
        conditionKey,
        expression: conditionExpression,
        rawResult: conditionResult,
        booleanResult
      });
      
      return booleanResult;
    } catch (error) {
      this.logger.warn('Condition evaluation error', {
        conditionKey,
        expression: conditionExpression,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Validate conditional node configuration
   */
  validate(node: WorkflowDSLNode): WorkflowValidationResult {
    const baseValidation = this.validateRequiredParams(node, [
      'sourceNodeId',
      'expression',
      'conditions'
    ]);

    if (!baseValidation.valid) {
      return baseValidation;
    }

    const params = node.parameters as ConditionalNodeParameters;
    const errors: any[] = [...baseValidation.errors];
    const warnings: any[] = [...baseValidation.warnings];
    const suggestions: any[] = [...baseValidation.suggestions];

    // Validate sourceNodeId
    if (typeof params.sourceNodeId !== 'string' || params.sourceNodeId.trim() === '') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'sourceNodeId must be a non-empty string',
        nodeId: node.id,
        severity: 'error'
      });
    }

    // Validate expression
    if (typeof params.expression !== 'string' || params.expression.trim() === '') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'expression must be a non-empty string',
        nodeId: node.id,
        severity: 'error'
      });
    } else {
      // Try to validate JSONata expression syntax
      try {
        jsonata(params.expression);
      } catch (expressionError) {
        errors.push({
          code: 'INVALID_JSONATA_EXPRESSION',
          message: `Invalid JSONata expression: ${expressionError instanceof Error ? expressionError.message : String(expressionError)}`,
          nodeId: node.id,
          severity: 'error'
        });
      }
    }

    // Validate conditions
    if (!params.conditions || typeof params.conditions !== 'object') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'conditions must be an object',
        nodeId: node.id,
        severity: 'error'
      });
    } else {
      const conditionKeys = Object.keys(params.conditions);
      
      if (conditionKeys.length === 0) {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: 'conditions object must contain at least one condition',
          nodeId: node.id,
          severity: 'error'
        });
      }

      // Validate each condition expression
      for (const [conditionKey, conditionExpression] of Object.entries(params.conditions)) {
        if (typeof conditionExpression !== 'string' || conditionExpression.trim() === '') {
          errors.push({
            code: 'INVALID_PARAMETERS',
            message: `Condition '${conditionKey}' must be a non-empty string`,
            nodeId: node.id,
            severity: 'error'
          });
        } else {
          try {
            jsonata(conditionExpression);
          } catch (conditionError) {
            errors.push({
              code: 'INVALID_JSONATA_EXPRESSION',
              message: `Invalid JSONata condition '${conditionKey}': ${conditionError instanceof Error ? conditionError.message : String(conditionError)}`,
              nodeId: node.id,
              severity: 'error'
            });
          }
        }
      }

      // Warning for too many conditions
      if (conditionKeys.length > 10) {
        warnings.push({
          code: 'COMPLEX_CONDITIONALS',
          message: `${conditionKeys.length} conditions may be too complex`,
          nodeId: node.id,
          suggestion: 'Consider simplifying logic or breaking into multiple conditional nodes'
        });
      }
    }

    // Suggestion for default condition
    if (!params.defaultCondition) {
      suggestions.push({
        type: 'best_practice',
        message: 'Consider specifying a defaultCondition for explicit fallback routing',
        impact: 'low',
        nodeId: node.id
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Generate visualization for conditional node
   */
  getVisualization(node: WorkflowDSLNode): string {
    const params = node.parameters as ConditionalNodeParameters;
    const conditionCount = params.conditions ? Object.keys(params.conditions).length : 0;
    const timeStr = node.estimatedTime ? ` (${node.estimatedTime}m)` : '';
    
    let visualization = `[CONDITIONAL] ${node.name}${timeStr}\n`;
    visualization += `              Source: ${params.sourceNodeId}\n`;
    visualization += `              Conditions: ${conditionCount}`;

    if (params.expression && params.expression.length <= 50) {
      visualization += `\n              Expression: ${params.expression}`;
    }

    return visualization;
  }

  /**
   * Get estimated execution time
   */
  getEstimatedTime(node: WorkflowDSLNode): number {
    if (node.estimatedTime) {
      return node.estimatedTime;
    }

    const params = node.parameters as ConditionalNodeParameters;
    const conditionCount = params.conditions ? Object.keys(params.conditions).length : 1;
    
    // Base time: 1 minute
    // Add time based on condition complexity
    let estimatedTime = 1;
    
    // More conditions = slightly more time
    estimatedTime += Math.ceil(conditionCount / 5);
    
    // Complex expressions take longer
    if (params.expression && params.expression.length > 100) {
      estimatedTime += 1;
    }

    return estimatedTime;
  }

  /**
   * Check if this handler can process the node
   */
  canHandle(node: WorkflowDSLNode): boolean {
    return node.type === 'conditional' && 
           node.parameters && 
           typeof node.parameters.sourceNodeId === 'string' &&
           typeof node.parameters.expression === 'string' &&
           typeof node.parameters.conditions === 'object';
  }
}