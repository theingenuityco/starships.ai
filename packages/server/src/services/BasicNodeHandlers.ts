/**
 * Basic Node Handlers
 * 
 * Handlers for basic workflow nodes (start, end, output) that don't require complex logic.
 */

import {
  WorkflowDSLNode,
  WorkflowNodeResult,
  WorkflowValidationResult,
  WorkflowExecutionContext
} from '@starships/protocol';
import { BaseWorkflowNodeHandler } from './WorkflowNodeRegistry';

/**
 * Handler for start nodes - always succeeds immediately
 */
export class StartNodeHandler extends BaseWorkflowNodeHandler {
  readonly type = 'start';

  async execute(
    node: WorkflowDSLNode,
    context: WorkflowExecutionContext
  ): Promise<WorkflowNodeResult> {
    return this.createSuccessResult(node, {
      message: 'Workflow started successfully',
      startedAt: new Date().toISOString(),
      contextId: context.expeditionId // Migration note: using expeditionId as contextId
    });
  }

  validate(node: WorkflowDSLNode): WorkflowValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    // Start nodes should have minimal parameters
    if (node.parameters && Object.keys(node.parameters).length > 0) {
      warnings.push({
        code: 'UNUSED_PARAMETERS',
        message: 'Start nodes typically do not require parameters',
        nodeId: node.id,
        suggestion: 'Consider removing unnecessary parameters'
      });
    }

    return {
      valid: true,
      errors,
      warnings,
      suggestions
    };
  }

  getVisualization(node: WorkflowDSLNode): string {
    return `[START] ${node.name}`;
  }

  getEstimatedTime(node: WorkflowDSLNode): number {
    return 0; // Start nodes execute instantly
  }
}

/**
 * Handler for end nodes - always succeeds immediately
 */
export class EndNodeHandler extends BaseWorkflowNodeHandler {
  readonly type = 'end';

  async execute(
    node: WorkflowDSLNode,
    context: WorkflowExecutionContext
  ): Promise<WorkflowNodeResult> {
    return this.createSuccessResult(node, {
      message: 'Workflow completed successfully',
      completedAt: new Date().toISOString(),
      contextId: context.expeditionId, // Migration note: using expeditionId as contextId
      totalResults: context.previousResults.size
    });
  }

  validate(node: WorkflowDSLNode): WorkflowValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    // End nodes should have minimal parameters
    if (node.parameters && Object.keys(node.parameters).length > 0) {
      warnings.push({
        code: 'UNUSED_PARAMETERS',
        message: 'End nodes typically do not require parameters',
        nodeId: node.id,
        suggestion: 'Consider removing unnecessary parameters'
      });
    }

    return {
      valid: true,
      errors,
      warnings,
      suggestions
    };
  }

  getVisualization(node: WorkflowDSLNode): string {
    return `[END] ${node.name}`;
  }

  getEstimatedTime(node: WorkflowDSLNode): number {
    return 0; // End nodes execute instantly
  }
}

/**
 * Handler for output nodes - generates formatted output
 */
export class OutputNodeHandler extends BaseWorkflowNodeHandler {
  readonly type = 'output';

  async execute(
    node: WorkflowDSLNode,
    context: WorkflowExecutionContext
  ): Promise<WorkflowNodeResult> {
    const params = node.parameters;
    const sources = Array.isArray(params.sources) ? params.sources : [];
    const template = typeof params.template === 'string' ? params.template : 'default';
    const format = typeof params.format === 'string' ? params.format : 'text';

    // Gather data from source nodes
    const sourceData: any[] = [];
    for (const sourceId of sources) {
      const sourceResult = context.previousResults.get(sourceId);
      if (sourceResult && sourceResult.success) {
        sourceData.push({
          nodeId: sourceId,
          data: sourceResult.data
        });
      }
    }

    // Generate output based on template and format
    const output = this.generateOutput(template, format, sourceData, node);

    return this.createSuccessResult(node, {
      output,
      template,
      format,
      sourceCount: sourceData.length,
      generatedAt: new Date().toISOString()
    });
  }

  validate(node: WorkflowDSLNode): WorkflowValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    const params = node.parameters;

    if (!params.template) {
      warnings.push({
        code: 'MISSING_TEMPLATE',
        message: 'Output node has no template specified, using default',
        nodeId: node.id,
        suggestion: 'Consider specifying an explicit template'
      });
    }

    if (!params.format) {
      warnings.push({
        code: 'MISSING_FORMAT',
        message: 'Output node has no format specified, using text',
        nodeId: node.id,
        suggestion: 'Consider specifying an explicit format'
      });
    }

    const sources = Array.isArray(params.sources) ? params.sources : [];
    if (sources.length === 0) {
      warnings.push({
        code: 'NO_SOURCES',
        message: 'Output node has no data sources specified',
        nodeId: node.id,
        suggestion: 'Consider adding source node IDs to gather data from'
      });
    }

    return {
      valid: true,
      errors,
      warnings,
      suggestions
    };
  }

  getVisualization(node: WorkflowDSLNode): string {
    const params = node.parameters;
    const sources = Array.isArray(params.sources) ? params.sources : [];
    const sourceCount = sources.length;
    const format = typeof params.format === 'string' ? params.format : 'text';
    const timeStr = node.estimatedTime ? ` (${node.estimatedTime}m)` : '';

    return `[OUTPUT] ${node.name}${timeStr}\n` +
           `         Format: ${format}\n` +
           `         Sources: ${sourceCount}`;
  }

  getEstimatedTime(node: WorkflowDSLNode): number {
    if (node.estimatedTime) {
      return node.estimatedTime;
    }

    const params = node.parameters;
    const sources = Array.isArray(params.sources) ? params.sources : [];
    const sourceCount = sources.length;
    
    // Base time: 1 minute, plus 0.5 minutes per source
    return Math.max(1, 1 + Math.floor(sourceCount * 0.5));
  }

  private generateOutput(
    template: string, 
    format: string, 
    sourceData: any[], 
    node: WorkflowDSLNode
  ): string {
    switch (template) {
      case 'expedition-summary': // Migration note: keeping for backward compatibility
      case 'context-summary':
        return this.generateContextSummary(sourceData, format);
      case 'report':
        return this.generateReport(sourceData, format);
      case 'simple':
      case 'test':
        return this.generateSimpleOutput(sourceData, format);
      default:
        return this.generateDefaultOutput(sourceData, format, node);
    }
  }

  private generateContextSummary(sourceData: any[], format: string): string { // Migration note: was generateExpeditionSummary
    const summary = {
      title: 'Workflow Results Summary', // Migration note: was 'Expedition Results Summary'
      completedAt: new Date().toISOString(),
      sourceCount: sourceData.length,
      results: sourceData.map(source => ({
        nodeId: source.nodeId,
        summary: this.summarizeData(source.data)
      }))
    };

    switch (format) {
      case 'json':
        return JSON.stringify(summary, null, 2);
      case 'markdown':
        return this.formatAsMarkdown(summary);
      default:
        return this.formatAsText(summary);
    }
  }

  private generateReport(sourceData: any[], format: string): string {
    const report = {
      reportTitle: 'Workflow Execution Report',
      generatedAt: new Date().toISOString(),
      dataPoints: sourceData.length,
      details: sourceData
    };

    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'markdown':
        return `# ${report.reportTitle}\n\n**Generated**: ${report.generatedAt}\n\n**Data Points**: ${report.dataPoints}\n\n## Details\n\n${report.details.map(d => `- ${this.summarizeData(d)}`).join('\n')}`;
      default:
        return `${report.reportTitle}\nGenerated: ${report.generatedAt}\nData Points: ${report.dataPoints}\n\n${report.details.map(d => this.summarizeData(d)).join('\n\n')}`;
    }
  }

  private generateSimpleOutput(sourceData: any[], format: string): string {
    const output = {
      message: 'Simple output generated',
      sourceCount: sourceData.length,
      timestamp: new Date().toISOString()
    };

    switch (format) {
      case 'json':
        return JSON.stringify(output, null, 2);
      default:
        return `${output.message} (${output.sourceCount} sources) at ${output.timestamp}`;
    }
  }

  private generateDefaultOutput(sourceData: any[], format: string, node: WorkflowDSLNode): string {
    const output = {
      nodeId: node.id,
      nodeName: node.name,
      sourceCount: sourceData.length,
      generatedAt: new Date().toISOString(),
      data: sourceData
    };

    switch (format) {
      case 'json':
        return JSON.stringify(output, null, 2);
      case 'markdown':
        return `# ${output.nodeName}\n\n**Generated**: ${output.generatedAt}\n**Sources**: ${output.sourceCount}\n\n## Data\n\n${sourceData.map(d => `### ${d.nodeId}\n${this.summarizeData(d.data)}`).join('\n\n')}`;
      default:
        return `${output.nodeName}\nGenerated: ${output.generatedAt}\nSources: ${output.sourceCount}\n\n${sourceData.map(d => `${d.nodeId}: ${this.summarizeData(d.data)}`).join('\n')}`;
    }
  }

  private summarizeData(data: any): string {
    if (!data) return 'No data';
    if (typeof data === 'string') return data;
    if (typeof data === 'object') {
      return Object.keys(data).length > 0 ? 
        JSON.stringify(data).substring(0, 100) + '...' : 
        'Empty object';
    }
    return String(data);
  }

  private formatAsMarkdown(data: any): string {
    return `# ${data.title}\n\n**Completed**: ${data.completedAt}\n**Sources**: ${data.sourceCount}\n\n## Results\n\n${data.results.map((r: any) => `### ${r.nodeId}\n${r.summary}`).join('\n\n')}`;
  }

  private formatAsText(data: any): string {
    return `${data.title}\nCompleted: ${data.completedAt}\nSources: ${data.sourceCount}\n\nResults:\n${data.results.map((r: any) => `${r.nodeId}: ${r.summary}`).join('\n')}`;
  }
}