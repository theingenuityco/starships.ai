/**
 * Mission Execution Engine
 * 
 * Sequential execution engine for mission workflows using real agent calls.
 * Runs approved workflow nodes in order, executes agents via native chat,
 * and tracks progress with comprehensive logging and error handling.
 */

import { RepositoryFactory } from '@starships/models';
import { MissionService } from './MissionService';
import { Logger } from '../utils/logger';
import { AgentExecutionService } from './AgentExecutionService';
import type {
  MissionWorkflow, 
  WorkflowNode, 
  MissionExecutionResult, 
  MissionNodeResult,
  MissionExecutionState,
  ChatRequest,
  ChatResponse 
} from '@starships/protocol';
import getStore from '../store';

export class MissionExecutionEngine {
  private logger = Logger.getInstance();
  private store = getStore();
  
  /**
   * Execute workflow sequentially - main entry point
   */
  async executeWorkflow(missionId: string, workflow: MissionWorkflow): Promise<MissionExecutionResult> {
    this.logger.info('Starting mission workflow execution', { 
      missionId, 
      workflowId: workflow.id 
    });
    
    // Get agent nodes only (skip start/end nodes)
    const agentNodes = workflow.nodes.filter(node => node.type === 'agent');
    
    // Initialize execution state
    await this.initializeExecutionState(missionId, agentNodes.length);
    
    // Execute nodes sequentially
    const results: MissionNodeResult[] = [];
    let failureError: string | undefined;
    
    for (let i = 0; i < agentNodes.length; i++) {
      const node = agentNodes[i];
      
      // Execute the node
      const result = await this.executeMissionNode(missionId, node);
      results.push(result);
      
      // Update progress after execution
      await this.updateExecutionProgress(missionId, i + 1, results);
      
      // If node fails, track error and stop execution
      if (!result.success) {
        failureError = result.error;
        break;
      }
    }
    
    // Mark as completed if all succeeded, otherwise mark as failed
    const success = results.every(r => r.success);
    const executionResult: MissionExecutionResult = {
      success,
      nodeResults: results,
      summary: `Executed ${results.length} tasks - ${success ? 'All completed successfully' : 'Execution stopped due to failure'}`,
      executedAt: new Date().toISOString()
    };
    
    if (success) {
      await this.markExecutionCompleted(missionId, results, executionResult);
    } else {
      await this.markExecutionFailed(missionId, results, failureError, executionResult);
    }
    
    return executionResult;
  }

  /**
   * Execute a single workflow node
   */
  private async executeMissionNode(missionId: string, node: WorkflowNode): Promise<MissionNodeResult> {
    this.logger.info('Executing mission node', { 
      missionId, 
      nodeId: node.id, 
      nodeName: node.name 
    });

    try {
      // Get agent from parameters with null-safe check
      const agentId = node.parameters?.agentId;
      if (!agentId) {
        throw new Error('No agent assigned to node');
      }

      // Compute safe instructions string
      const paramInstructions = typeof node.parameters?.instructions === 'string' ? node.parameters.instructions : '';
      const instructions = (node.description?.trim() || paramInstructions || node.name)?.trim();
      if (!instructions) {
        throw new Error('No instructions found for node');
      }

      // Execute using real agent system
      const output = await this.callMissionAgent(agentId, instructions, missionId);
      
      return {
        nodeId: node.id,
        nodeName: node.name,
        success: true,
        output,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Execution failed';
      this.logger.error('Mission node execution failed', {
        missionId,
        nodeId: node.id,
        error: errorMessage
      });

      return {
        nodeId: node.id,
        nodeName: node.name,
        success: false,
        output: '',
        error: errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Call agent to execute task using real agent engine with retry logic
   */
  private async callMissionAgent(agentId: string, instructions: string, missionId: string): Promise<string> {
    // Get starship owner ID to satisfy ownership checks
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const mission = await MissionService.getMissionById(missionId);
    const starship = await starshipRepo.findById(mission.starshipId);
    const effectiveUserId = starship?.ownerId ?? ""; // Use owner to satisfy ownership check
    
    // Get agent details for validation
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.findById(agentId);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.logger.info('Starting real agent execution for mission task', {
      agentId,
      agentName: agent.name,
      agentCategory: agent.category,
      missionId,
      userId: effectiveUserId,
      instructionsLength: instructions.length
    });

    // Retry configuration
    const maxRetries = 2;
    const baseDelay = 1000; // 1 second
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Create ChatRequest for the agent
        const chatRequest: ChatRequest = {
          source: 'agent',
          agent_id: agentId,
          user_id: effectiveUserId,
          message: `Mission Task: ${instructions}

Please execute this task as part of mission ${missionId}. Provide a comprehensive response with clear results and any relevant analysis or recommendations.`,
          stream: false
        };

        this.logger.info('Executing real agent call via native chat', {
          agentId,
          missionId,
          messageLength: chatRequest.message.length,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1
        });

        // Execute using real agent engine with shared memory store
        const startTime = Date.now();
        const response: ChatResponse = await AgentExecutionService.executeChat(chatRequest);
        const executionTime = Date.now() - startTime;

        this.logger.info('Real agent execution completed successfully', {
          agentId,
          agentName: agent.name,
          missionId,
          executionTime,
          responseLength: response.content.length,
          tokenUsage: response.usage,
          attempt: attempt + 1
        });

        // Return the agent's content directly
        return response.content;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during agent execution';
        const isRetryableError = this.isRetryableError(error);
        
        this.logger.error('Agent execution failed', {
          agentId,
          agentName: agent.name,
          missionId,
          userId: effectiveUserId,
          error: errorMessage,
          errorStack: error instanceof Error ? error.stack : undefined,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          isRetryableError,
          willRetry: isRetryableError && attempt < maxRetries
        });

        // If this is the last attempt or not a retryable error, throw
        if (attempt === maxRetries || !isRetryableError) {
          throw new Error(`Agent execution failed after ${attempt + 1} attempts: ${errorMessage}`);
        }

        // Wait before retry with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        this.logger.info(`Retrying agent execution in ${delay}ms`, {
          agentId,
          missionId,
          attempt: attempt + 1,
          delay
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected error in callMissionAgent');
  }

  /**
   * Determine if an error is retryable (429, 5xx status codes)
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    
    const errorMessage = error.message.toLowerCase();
    
    // Check for rate limiting (429) or server errors (5xx)
    return (
      errorMessage.includes('429') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('server error') ||
      errorMessage.includes('503') ||
      errorMessage.includes('502') ||
      errorMessage.includes('500') ||
      errorMessage.includes('timeout')
    );
  }

  // ============================================================================
  // STATE MANAGEMENT HELPERS
  // ============================================================================

  /**
   * Initialize execution state when starting
   */
  private async initializeExecutionState(missionId: string, totalNodes: number): Promise<void> {
    const executionState: MissionExecutionState = {
      status: 'running',
      currentNodeIndex: 0,
      totalNodes,
      nodeResults: [],
      startedAt: new Date().toISOString()
    };
    
    await MissionService.updateMission(missionId, { executionState });
  }
  
  /**
   * Update execution progress after each node
   */
  private async updateExecutionProgress(
    missionId: string, 
    currentIndex: number, 
    results: MissionNodeResult[]
  ): Promise<void> {
    const mission = await MissionService.getMissionById(missionId);
    if (mission.executionState) {
      mission.executionState.currentNodeIndex = currentIndex;
      mission.executionState.nodeResults = [...results];
      await MissionService.updateMission(missionId, { executionState: mission.executionState });
    }
  }
  
  /**
   * Mark execution as completed
   */
  private async markExecutionCompleted(missionId: string, results: MissionNodeResult[], executionResult: MissionExecutionResult): Promise<void> {
    const mission = await MissionService.getMissionById(missionId);
    if (mission.executionState) {
      mission.executionState.status = 'completed';
      mission.executionState.currentNodeIndex = mission.executionState.totalNodes;
      mission.executionState.nodeResults = results;
      mission.executionState.completedAt = new Date().toISOString();
      await MissionService.updateMission(missionId, { 
        executionState: mission.executionState,
        executionResult: executionResult
      });
    }
  }
  
  /**
   * Mark execution as failed
   */
  private async markExecutionFailed(missionId: string, results: MissionNodeResult[], error?: string, executionResult?: MissionExecutionResult): Promise<void> {
    const mission = await MissionService.getMissionById(missionId);
    if (mission.executionState) {
      mission.executionState.status = 'failed';
      mission.executionState.nodeResults = results;
      mission.executionState.error = error || 'Execution failed';
      mission.executionState.completedAt = new Date().toISOString();
      await MissionService.updateMission(missionId, { 
        executionState: mission.executionState,
        executionResult: executionResult
      });
    }
  }
}