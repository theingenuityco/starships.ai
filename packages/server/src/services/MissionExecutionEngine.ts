/**
 * Mission Execution Engine
 * 
 * Simple sequential execution engine for mission workflows.
 * Runs approved workflow nodes in order and tracks progress.
 */

import { RepositoryFactory } from '@starships/models';
import { MissionService } from './MissionService';
import { Logger } from '../utils/logger';
import type { 
  MissionWorkflow, 
  WorkflowNode, 
  MissionExecutionResult, 
  MissionNodeResult,
  MissionExecutionState 
} from '@starships/protocol';

export class MissionExecutionEngine {
  private logger = Logger.getInstance();
  
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
    for (let i = 0; i < agentNodes.length; i++) {
      const node = agentNodes[i];
      
      // Update current progress
      await this.updateExecutionProgress(missionId, i, results);
      
      // Execute the node
      const result = await this.executeMissionNode(missionId, node);
      results.push(result);
      
      // If node fails, stop execution
      if (!result.success) {
        await this.markExecutionFailed(missionId, results, result.error);
        break;
      }
    }
    
    // Mark as completed if all succeeded
    const success = results.every(r => r.success);
    if (success) {
      await this.markExecutionCompleted(missionId, results);
    }
    
    return {
      success,
      nodeResults: results,
      summary: `Executed ${results.length} tasks - ${success ? 'All completed successfully' : 'Execution stopped due to failure'}`,
      executedAt: new Date().toISOString()
    };
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
      // Get agent from parameters
      const agentId = node.parameters.agentId;
      if (!agentId) {
        throw new Error('No agent assigned to node');
      }

      // Execute using agent system
      const output = await this.callMissionAgent(agentId, node.description, missionId);
      
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
   * Call agent to execute task - placeholder for now
   */
  private async callMissionAgent(agentId: string, instructions: string, missionId: string): Promise<string> {
    // Get agent details
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.findById(agentId);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // TODO: Replace with actual agent execution system
    // For now, simulate execution with delay
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    
    return `Agent "${agent.name}" completed: ${instructions}`;
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
  private async markExecutionCompleted(missionId: string, results: MissionNodeResult[]): Promise<void> {
    const mission = await MissionService.getMissionById(missionId);
    if (mission.executionState) {
      mission.executionState.status = 'completed';
      mission.executionState.currentNodeIndex = mission.executionState.totalNodes;
      mission.executionState.nodeResults = results;
      mission.executionState.completedAt = new Date().toISOString();
      await MissionService.updateMission(missionId, { executionState: mission.executionState });
    }
  }
  
  /**
   * Mark execution as failed
   */
  private async markExecutionFailed(missionId: string, results: MissionNodeResult[], error?: string): Promise<void> {
    const mission = await MissionService.getMissionById(missionId);
    if (mission.executionState) {
      mission.executionState.status = 'failed';
      mission.executionState.nodeResults = results;
      mission.executionState.error = error || 'Execution failed';
      mission.executionState.completedAt = new Date().toISOString();
      await MissionService.updateMission(missionId, { executionState: mission.executionState });
    }
  }
}