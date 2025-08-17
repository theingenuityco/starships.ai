/**
 * MissionPlanService - Business logic for mission execution plans
 * 
 * Handles business operations for mission plans including creation, updates,
 * and data transformations. Follows service layer pattern for separation of concerns.
 */

import { RepositoryFactory } from '@starships/models';
import { 
  MissionPlan, 
  MissionTask, 
  CreateMissionPlanRequest,
  UpdateMissionPlanRequest,
  MissionPlanResponse 
} from '@starships/protocol';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class MissionPlanService {
  private static logger = Logger.getInstance();

  /**
   * Business logic helper - calculate agent assignments for UI display
   */
  static getAgentAssignments(plan: MissionPlan): Record<string, string[]> {
    return plan.tasks.reduce((assignments, task) => {
      if (!assignments[task.assignedAgentId]) {
        assignments[task.assignedAgentId] = [];
      }
      assignments[task.assignedAgentId].push(task.id);
      return assignments;
    }, {} as Record<string, string[]>);
  }

  /**
   * Convert dependency indices from AI response to task IDs
   */
  static convertDependencyIndices(tasks: any[]): Omit<MissionTask, 'id'>[] {
    const taskIds = tasks.map(() => uuidv4());
    
    return tasks.map((task) => ({
      title: task.title,
      description: task.description,
      assignedAgentId: task.assignedAgentId,
      dependencies: (task.dependencies || []).map((depIndex: number) => 
        taskIds[depIndex]
      ).filter((id: string) => id),
      deliverable: task.deliverable,
      priority: task.priority || 'medium'
    }));
  }

  /**
   * Create mission plan
   */
  static async createPlan(request: CreateMissionPlanRequest): Promise<MissionPlan> {
    try {
      const planRepo = RepositoryFactory.getMissionPlanRepository();
      return await planRepo.createPlan(request);
    } catch (error) {
      this.logger.error('Failed to create mission plan', {
        service: 'MissionPlanService',
        operation: 'createPlan',
        missionId: request.missionId
      }, error as Error);
      throw error;
    }
  }

  /**
   * Get plan with calculated agent assignments for API response
   */
  static async getPlanResponse(missionId: string): Promise<MissionPlanResponse | null> {
    try {
      const planRepo = RepositoryFactory.getMissionPlanRepository();
      const plan = await planRepo.getPlanByMissionId(missionId);
      
      if (!plan) return null;

      return {
        ...plan,
        agentAssignments: this.getAgentAssignments(plan)
      };
    } catch (error) {
      this.logger.error('Failed to get mission plan response', {
        service: 'MissionPlanService',
        operation: 'getPlanResponse',
        missionId
      }, error as Error);
      throw error;
    }
  }

  /**
   * Update plan approval status
   */
  static async updatePlanApproval(missionId: string, approved: boolean): Promise<MissionPlan> {
    try {
      const planRepo = RepositoryFactory.getMissionPlanRepository();
      const updates: UpdateMissionPlanRequest = {
        approvalStatus: approved ? 'approved' : 'rejected',
        approvalTimestamp: new Date().toISOString()
      };
      
      return await planRepo.updatePlan(missionId, updates);
    } catch (error) {
      this.logger.error('Failed to update plan approval', {
        service: 'MissionPlanService',
        operation: 'updatePlanApproval',
        missionId,
        approved
      }, error as Error);
      throw error;
    }
  }

  /**
   * Delete plan (for regeneration)
   */
  static async deletePlan(missionId: string): Promise<void> {
    try {
      const planRepo = RepositoryFactory.getMissionPlanRepository();
      await planRepo.deletePlan(missionId);
    } catch (error) {
      this.logger.error('Failed to delete mission plan', {
        service: 'MissionPlanService',
        operation: 'deletePlan',
        missionId
      }, error as Error);
      throw error;
    }
  }
}