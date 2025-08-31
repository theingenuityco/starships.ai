/**
 * WorkflowService - Business logic for mission workflow DSL
 * 
 * Handles business operations for mission workflows including creation, updates,
 * and data transformations. Follows service layer pattern for separation of concerns.
 */

import { RepositoryFactory } from '@starships/models';
import {
  MissionWorkflow,
  WorkflowNode,
  WorkflowEdge,
  CreateWorkflowRequest,
  UpdateWorkflowApprovalRequest
} from '@starships/protocol';
import { Logger } from '../utils/logger';
// import { v4 as uuidv4 } from 'uuid';

export class WorkflowService {
  private static logger = Logger.getInstance();

  /**
   * Get workflow by mission ID
   */
  static async getWorkflowByMissionId(missionId: string): Promise<MissionWorkflow | null> {
    try {
      // TODO: Implement workflow storage - for now return null as workflows are ephemeral
      this.logger.warn('Workflow storage not implemented, returning null', { missionId });
      return null;
    } catch (error) {
      this.logger.error('Error getting workflow by mission ID', { error });
      throw error;
    }
  }

  /**
   * Create new workflow from request
   */
  static async createWorkflow(request: CreateWorkflowRequest): Promise<MissionWorkflow> {
    try {
      // TODO: Implement workflow storage - for now create ephemeral workflow
      this.logger.warn('Workflow storage not implemented, creating ephemeral workflow', { missionId: request.missionId });
      
      const workflow: MissionWorkflow = {
        id: `workflow-${request.missionId}-${Date.now()}`,
        missionId: request.missionId,
        nodes: request.nodes.map((node, index) => ({
          ...node,
          id: `node-${index}`
        })),
        edges: request.edges.map((edge, index) => ({
          ...edge,
          id: `edge-${index}`
        })),
        approvalStatus: 'pending',
        createdAt: new Date().toISOString()
      };
      
      return workflow;
    } catch (error) {
      this.logger.error('Error creating workflow', { error });
      throw error;
    }
  }

  /**
   * Update workflow approval status
   */
  static async updateWorkflowApproval(missionId: string, updates: UpdateWorkflowApprovalRequest): Promise<MissionWorkflow> {
    try {
      // First get the workflow to find its ID
      const workflow = await this.getWorkflowByMissionId(missionId);
      if (!workflow) {
        throw new Error(`Workflow not found for mission ${missionId}`);
      }

      // TODO: Implement workflow storage - for now update ephemeral workflow
      this.logger.warn('Workflow storage not implemented, updating ephemeral workflow', { missionId });
      
      const updatedWorkflow: MissionWorkflow = {
        ...workflow,
        approvalStatus: updates.approvalStatus,
        ...(updates.approvalStatus === 'approved' && { approvedAt: new Date().toISOString() })
      };
      
      return updatedWorkflow;
    } catch (error) {
      this.logger.error('Error updating workflow approval', { error });
      throw error;
    }
  }

  /**
   * Delete workflow by mission ID
   */
  static async deleteWorkflow(missionId: string): Promise<void> {
    try {
      // First get the workflow to find its ID
      const workflow = await this.getWorkflowByMissionId(missionId);
      if (!workflow) {
        this.logger.warn(`No workflow found for mission ${missionId} to delete`);
        return;
      }

      // TODO: Implement workflow storage - for now just log deletion
      this.logger.warn('Workflow storage not implemented, skipping deletion', { missionId });
    } catch (error) {
      this.logger.error('Error deleting workflow', { error });
      throw error;
    }
  }

  /**
   * Convert AI-generated task array to WorkflowDSL nodes and edges
   * Transforms from task-based format to workflow DSL format
   */
  static convertTasksToWorkflowDSL(tasks: any[], missionId: string): CreateWorkflowRequest {
    const nodes: Omit<WorkflowNode, 'id'>[] = [];
    const edges: Omit<WorkflowEdge, 'id'>[] = [];

    // Create start node
    const startNodeRef = 'start-node';
    nodes.push({
      type: 'start',
      name: 'Start Mission',
      description: 'Initialize mission execution',
      parameters: {}
    });

    // Create agent nodes for each task
    const taskNodeRefs: string[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const nodeRef = `agent-${i}`;
      taskNodeRefs.push(nodeRef);

      nodes.push({
        type: 'agent',
        name: task.title || `Task ${i + 1}`,
        description: task.description || '',
        parameters: {
          agentId: task.assignedAgentId,
          instructions: task.description || task.title,
          expectedOutput: task.deliverable || 'Task completion',
          priority: task.priority || 'medium'
        }
      });
    }

    // Create end node
    const endNodeRef = 'end-node';
    nodes.push({
      type: 'end',
      name: 'Complete Mission',
      description: 'Mission execution completed',
      parameters: {}
    });

    // Create edges for sequential flow (for now)
    // Start -> first task
    if (taskNodeRefs.length > 0) {
      edges.push({
        from: startNodeRef,
        to: taskNodeRefs[0]
      });

      // Task -> Task (sequential)
      for (let i = 0; i < taskNodeRefs.length - 1; i++) {
        edges.push({
          from: taskNodeRefs[i],
          to: taskNodeRefs[i + 1]
        });
      }

      // Last task -> end
      edges.push({
        from: taskNodeRefs[taskNodeRefs.length - 1],
        to: endNodeRef
      });
    } else {
      // No tasks, just start -> end
      edges.push({
        from: startNodeRef,
        to: endNodeRef
      });
    }

    return {
      missionId,
      nodes,
      edges
    };
  }

  /**
   * Extract task-like information from workflow for backward compatibility
   */
  static extractTasksFromWorkflow(workflow: MissionWorkflow): any[] {
    return workflow.nodes
      .filter(node => node.type === 'agent')
      .map((node) => ({
        id: node.id,
        title: node.name,
        description: node.description,
        assignedAgentId: node.parameters.agentId,
        dependencies: [], // TODO: Extract from edges if needed
        deliverable: node.parameters.expectedOutput || '',
        priority: node.parameters.priority || 'medium'
      }));
  }
}