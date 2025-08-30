/**
 * Output Node Handler
 * 
 * Output formatting handler using BaseHandler pattern
 */

import { BaseHandler } from '../Handler';
import { ExecutionContext, ValidationResult, OutputNodeParameters, Node as WorkflowNode } from '../../types';

export class OutputHandler extends BaseHandler {
  readonly type = 'output';

  async execute(context: ExecutionContext) {
    const params = this.node.parameters as OutputNodeParameters;
    // Gather data from source nodes
    const sourceData: Record<string, any> = {};
    for (const sourceNodeId of params.sources) {
      const sourceResult = context.previousResults.get(sourceNodeId);
      if (sourceResult) {
        sourceData[sourceNodeId] = sourceResult.data;
      }
    }

    // TODO: Implement template rendering (Mustache/Handlebars)
    // For now, return simple formatted output
    const output = `# ${params.title || 'Workflow Output'}\n\n${JSON.stringify(sourceData, null, 2)}`;
    
    return this.createSuccessResult({
      output,
      format: params.format,
      sourceData
    }, 50);
  }

  validate(): ValidationResult {
    const errors = [];
    const params = this.node.parameters as OutputNodeParameters;

    if (!params.template) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Template is required'
      ));
    }

    if (!params.sources || params.sources.length === 0) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'At least one source node is required'
      ));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      suggestions: []
    };
  }

  getIcon(): string {
    return 'file-text';
  }
}