/**
 * Output Node Handler
 * 
 * Output formatting handler using BaseHandler pattern
 */

import { BaseHandler } from '../Handler';
import { ExecutionContext, ValidationResult, OutputNodeParameters } from '../../types';

export class OutputHandler extends BaseHandler {
  readonly type = 'output';
  private params: OutputNodeParameters;

  constructor(parameters: any, nodeId: string) {
    super(parameters, nodeId);
    this.params = parameters as OutputNodeParameters;
  }

  async execute(context: ExecutionContext) {
    // Gather data from source nodes
    const sourceData: Record<string, any> = {};
    for (const sourceNodeId of this.params.sources) {
      const sourceResult = context.previousResults.get(sourceNodeId);
      if (sourceResult) {
        sourceData[sourceNodeId] = sourceResult.data;
      }
    }

    // TODO: Implement template rendering (Mustache/Handlebars)
    // For now, return simple formatted output
    const output = `# ${this.params.title || 'Workflow Output'}\n\n${JSON.stringify(sourceData, null, 2)}`;
    
    return this.createSuccessResult({
      output, 
      format: this.params.format,
      sourceData 
    }, 50);
  }

  validate(): ValidationResult {
    const errors = [];

    if (!this.params.template) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'Template is required'
      ));
    }

    if (!this.params.sources || this.params.sources.length === 0) {
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