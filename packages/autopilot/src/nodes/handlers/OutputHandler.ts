/**
 * Output Node Handler
 * 
 * Output formatting handler
 */

import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, OutputNodeParameters } from '../../types';

export class OutputHandler implements Handler {
  readonly type = 'output';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as OutputNodeParameters;
    
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
    
    return {
      nodeId: node.id,
      success: true,
      data: { 
        output, 
        format: params.format,
        sourceData 
      },
      executedAt: new Date().toISOString(),
      duration: 50
    };
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as OutputNodeParameters;
    const errors = [];

    if (!params.template) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Template is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.sources || params.sources.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one source node is required',
        nodeId: node.id,
        severity: 'error' as const
      });
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