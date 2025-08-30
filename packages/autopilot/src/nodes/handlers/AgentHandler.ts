/**
 * Agent Node Handler
 *
 * Executes agent with embedded workflow functionality
 */

import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, AgentNodeParameters } from '../../types';
import { Engine } from '../../engine/Engine';
import { Registry } from '../Registry';
import { StartHandler } from './StartHandler';
import { EndHandler } from './EndHandler';

export class AgentHandler implements Handler {
  readonly type = 'agent';
  private engine: Engine;

  constructor() {
    const registry = new Registry();
    
    // Register basic handlers needed for workflow execution
    registry.register(new StartHandler());
    registry.register(new EndHandler());
    
    this.engine = new Engine(registry);
  }

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as AgentNodeParameters;
    const startTime = Date.now();
    
    try {
      console.log(`Executing agent: ${params.name} (model: ${params.model}) with workflow execution`);
      
      // Prepare workflow execution context
      const existingState = (context.expeditionState as Record<string, unknown>) || {};
      const workflowContext: Partial<ExecutionContext> = {
        ...context,
        // Merge agent context with workflow context
        expeditionState: {
          ...existingState,
          agentName: params.name,
          agentModel: params.model,
          agentSystemPrompt: params.systemPrompt,
          agentInstructions: params.instructions,
          ...params.workflowContext
        }
      };

      // Execute the embedded workflow
      const workflowResult = await this.engine.execute(params.workflow, workflowContext);
      
      // Check if workflow execution was successful
      if (workflowResult.status === 'completed') {
        // Collect all successful workflow results
        const workflowOutputs = Array.from(workflowResult.executionResults.values())
          .filter(result => result.success)
          .map(result => result.data);

        return {
          nodeId: node.id,
          success: true,
          data: {
            agentName: params.name,
            model: params.model,
            systemPrompt: params.systemPrompt,
            instructions: params.instructions,
            workflowId: params.workflow.id,
            workflowResults: workflowOutputs,
            workflowStatus: workflowResult.status,
            output: `Agent ${params.name} completed workflow execution successfully`
          },
          executedAt: new Date().toISOString(),
          duration: Math.max(1, Date.now() - startTime)
        };
      } else {
        // Workflow execution failed
        const errorMessage = workflowResult.error?.message || 'Workflow execution failed';
        return {
          nodeId: node.id,
          success: false,
          error: `Agent ${params.name} workflow execution failed: ${errorMessage}`,
          data: {
            agentName: params.name,
            workflowId: params.workflow.id,
            workflowStatus: workflowResult.status,
            workflowError: workflowResult.error
          },
          executedAt: new Date().toISOString(),
          duration: Math.max(1, Date.now() - startTime)
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        nodeId: node.id,
        success: false,
        error: `Agent ${params.name} execution failed: ${errorMessage}`,
        data: {
          agentName: params.name,
          model: params.model
        },
        executedAt: new Date().toISOString(),
        duration: Math.max(1, Date.now() - startTime)
      };
    }
  }

  validate(node: Node): ValidationResult {
    const params = node.parameters as AgentNodeParameters;
    const errors = [];
    const warnings = [];

    // Check for required fields
    if (!params.name) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent name is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.model) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent model is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.workflow) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent workflow is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    } else {
      // Validate workflow structure
      if (!params.workflow.nodes || params.workflow.nodes.length === 0) {
        errors.push({
          code: 'INVALID_WORKFLOW',
          message: 'Agent workflow must contain at least one node',
          nodeId: node.id,
          severity: 'error' as const
        });
      }

      // Check for start node
      const hasStartNode = params.workflow.nodes.some(n => n.type === 'start');
      if (!hasStartNode) {
        errors.push({
          code: 'INVALID_WORKFLOW',
          message: 'Agent workflow must have a start node',
          nodeId: node.id,
          severity: 'error' as const
        });
      }

      // Check for circular references in workflow
      if (params.workflow.edges && params.workflow.edges.length > 0) {
        const nodeIds = new Set(params.workflow.nodes.map(n => n.id));
        for (const edge of params.workflow.edges) {
          if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
            errors.push({
              code: 'INVALID_WORKFLOW',
              message: `Invalid edge reference in workflow: ${edge.from} -> ${edge.to}`,
              nodeId: node.id,
              severity: 'error' as const
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: []
    };
  }

  getIcon(): string {
    return 'robot';
  }
}