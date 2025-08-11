/**
 * Agent Node Handler
 * 
 * Handles execution of agent nodes within the workflow DSL system.
 * Integrates with the existing agent system to execute tasks via AI agents.
 */

import {
  WorkflowDSLNode,
  WorkflowNodeResult,
  WorkflowValidationResult,
  WorkflowExecutionContext,
  AgentNodeParameters
} from '@starships/protocol';
import { BaseWorkflowNodeHandler } from './WorkflowNodeRegistry';
import { AgentService } from './AgentService';
import { TaskService } from './TaskService';
import { FirstOfficerService } from './FirstOfficerService';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';

/**
 * Handler for executing agent nodes
 */
export class AgentNodeHandler extends BaseWorkflowNodeHandler {
  readonly type = 'agent';
  private logger = Logger.getInstance();
  private taskService: TaskService;
  private firstOfficerService: FirstOfficerService;

  constructor() {
    super();
    this.taskService = TaskService.getInstance();
    this.firstOfficerService = FirstOfficerService.getInstance();
  }

  /**
   * Execute the agent node
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

    this.logger.info('Starting agent node execution', logContext);

    try {
      // Validate node parameters
      const validation = this.validate(node);
      if (!validation.valid) {
        const errors = validation.errors.map(e => e.message).join(', ');
        return this.createErrorResult(node, `Validation failed: ${errors}`);
      }

      const params = node.parameters as AgentNodeParameters;
      
      // Get agent information
      const agent = await AgentService.getAgent(params.agentId);
      if (!agent) {
        return this.createErrorResult(
          node, 
          `Agent not found: ${params.agentId}`
        );
      }

      this.logger.info('Agent found, executing tasks', {
        ...logContext,
        agentId: params.agentId,
        taskIds: params.taskIds
      });

      // Execute tasks using the agent
      const executionResult = await this.executeAgentTasks(
        params,
        context,
        agent,
        node
      );

      const duration = Date.now() - startTime;
      
      this.logger.info('Agent node execution completed', {
        ...logContext,
        duration,
        success: executionResult.success
      });

      return {
        ...executionResult,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('Agent node execution failed', {
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
   * Execute tasks using the assigned agent
   */
  private async executeAgentTasks(
    params: AgentNodeParameters,
    context: WorkflowExecutionContext,
    agent: any,
    node: WorkflowDSLNode
  ): Promise<WorkflowNodeResult> {
    try {
      // Get expedition from context
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(context.expeditionId);
      
      if (!expedition) {
        return this.createErrorResult(
          node, 
          `Expedition not found: ${context.expeditionId}`
        );
      }

      // Prepare task execution context
      const taskResults = [];
      
      for (const taskId of params.taskIds) {
        try {
          // Get task details (in real implementation, tasks would be fetched from DB)
          const taskContext = {
            taskId,
            instructions: params.instructions || node.description,
            expectedOutput: params.expectedOutput || 'Task completion',
            agentId: params.agentId,
            expeditionId: context.expeditionId
          };

          // For now, simulate task execution with a structured result
          // In production, this would use the actual agent execution system
          const taskResult = await this.simulateTaskExecution(taskContext, agent);
          taskResults.push(taskResult);

          this.logger.info('Task executed successfully', {
            taskId,
            agentId: params.agentId,
            executionTime: taskResult.executionTime
          });

        } catch (taskError) {
          const errorMessage = taskError instanceof Error ? taskError.message : 'Task execution failed';
          this.logger.error('Task execution failed', {
            taskId,
            error: errorMessage
          });
          
          taskResults.push({
            taskId,
            success: false,
            error: errorMessage,
            result: null
          });
        }
      }

      // Determine overall success
      const successfulTasks = taskResults.filter(r => r.success);
      const allTasksSuccessful = successfulTasks.length === taskResults.length;

      // Prepare result data
      const resultData = {
        agentId: params.agentId,
        agentName: agent.name,
        tasksExecuted: taskResults.length,
        successfulTasks: successfulTasks.length,
        results: taskResults,
        summary: allTasksSuccessful 
          ? `Successfully executed ${taskResults.length} tasks`
          : `Executed ${successfulTasks.length}/${taskResults.length} tasks successfully`
      };

      return this.createSuccessResult(node, resultData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent execution failed';
      return this.createErrorResult(node, errorMessage);
    }
  }

  /**
   * Simulate task execution (placeholder for actual agent integration)
   * In production, this would integrate with the real agent execution system
   */
  private async simulateTaskExecution(
    taskContext: any,
    agent: any
  ): Promise<any> {
    // Simulate processing time
    const executionTime = Math.random() * 2000 + 1000; // 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, Math.min(executionTime, 5000)));

    // Simulate task execution result
    return {
      taskId: taskContext.taskId,
      success: true,
      result: {
        summary: `Task executed by ${agent.name}`,
        details: taskContext.instructions,
        output: `Completed: ${taskContext.expectedOutput}`,
        confidence: 0.85 + Math.random() * 0.15 // 0.85-1.0
      },
      executionTime: Math.round(executionTime),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate agent node configuration
   */
  validate(node: WorkflowDSLNode): WorkflowValidationResult {
    const baseValidation = this.validateRequiredParams(node, [
      'agentId',
      'taskIds'
    ]);

    if (!baseValidation.valid) {
      return baseValidation;
    }

    const params = node.parameters as AgentNodeParameters;
    const errors: any[] = [...baseValidation.errors];
    const warnings: any[] = [...baseValidation.warnings];
    const suggestions: any[] = [...baseValidation.suggestions];

    // Validate taskIds is array
    if (!Array.isArray(params.taskIds) || params.taskIds.length === 0) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'taskIds must be a non-empty array',
        nodeId: node.id,
        severity: 'error'
      });
    }

    // Validate agentId is string
    if (typeof params.agentId !== 'string' || params.agentId.trim() === '') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'agentId must be a non-empty string',
        nodeId: node.id,
        severity: 'error'
      });
    }

    // Warning for timeout
    if (params.timeout && params.timeout > 60) {
      warnings.push({
        code: 'POTENTIAL_TIMEOUT',
        message: `Task timeout of ${params.timeout} minutes may be too long`,
        nodeId: node.id,
        suggestion: 'Consider breaking down into smaller tasks'
      });
    }

    // Suggestion for many tasks
    if (params.taskIds.length > 5) {
      suggestions.push({
        type: 'optimization',
        message: 'Consider splitting large number of tasks across multiple agent nodes',
        impact: 'medium',
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
   * Generate visualization for agent node
   */
  getVisualization(node: WorkflowDSLNode): string {
    const params = node.parameters as AgentNodeParameters;
    const taskCount = params.taskIds?.length || 0;
    const timeStr = node.estimatedTime ? ` (${node.estimatedTime}m)` : '';
    
    return `[AGENT] ${node.name}${timeStr}\n` +
           `        Agent: ${params.agentId}\n` +
           `        Tasks: ${taskCount}`;
  }

  /**
   * Get estimated execution time
   */
  getEstimatedTime(node: WorkflowDSLNode): number {
    if (node.estimatedTime) {
      return node.estimatedTime;
    }

    const params = node.parameters as AgentNodeParameters;
    const taskCount = params.taskIds?.length || 1;
    
    // Base time per task: 10 minutes
    // Add complexity factor based on instructions length
    const instructionsComplexity = params.instructions ? 
      Math.min(params.instructions.length / 100, 5) : 1;
    
    return Math.round(taskCount * 10 * instructionsComplexity);
  }

  /**
   * Check if this handler can process the node
   */
  canHandle(node: WorkflowDSLNode): boolean {
    return node.type === 'agent' && 
           node.parameters && 
           typeof node.parameters.agentId === 'string';
  }
}