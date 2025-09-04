/**
 * Mission Service
 * Business logic layer for mission operations
 */

import {
  MissionRepository,
  StarshipRepository,
  AgentRepository,
  MissionClarityRepository,
} from '@starships/models';
import { MissionOrchestratorService } from './MissionOrchestratorService';
import { MissionEventService } from './MissionEventService';
import type {
  MissionModel,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort,
  MissionListResponse,
  MissionStatus,
  MissionPhase,
  MissionClarityModel,
} from '@starships/protocol';
import { ValidationError, NotFoundError } from '@starships/errors';

export class MissionService {
  /**
   * Create a new mission
   */
  static async createMission(request: CreateMissionRequest, userId: string): Promise<MissionModel> {
    const missionRepo = new MissionRepository();
    const starshipRepo = new StarshipRepository();
    const agentRepo = new AgentRepository();

    // Verify that the starship exists and user has access
    try {
      await starshipRepo.findById(request.starshipId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Starship not found', 'Starship', request.starshipId);
      }
      throw error;
    }

    // Verify all assigned agents exist and belong to this starship
    const assignedAgents = [];
    for (const agentId of request.agentIds) {
      try {
        const agent = await agentRepo.findById(agentId);
        if (!agent) {
          throw new NotFoundError('Agent not found', 'Agent', agentId);
        }
        if (agent.starshipId !== request.starshipId) {
          throw new ValidationError(
            `Agent ${agentId} does not belong to starship ${request.starshipId}`,
            'agentIds'
          );
        }
        assignedAgents.push(agent);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new NotFoundError('Agent not found', 'Agent', agentId);
        }
        throw error;
      }
    }

    // Validate mission name is unique for this starship (optional business rule)
    const existingMissions = await missionRepo.getMissionModelsByStarshipId(
      request.starshipId,
      { status: ['draft', 'active'] } // Only check active missions
    );

    const duplicateName = existingMissions.missions.find(
      (mission: MissionModel) => mission.name.toLowerCase() === request.name.toLowerCase()
    );

    if (duplicateName) {
      throw new ValidationError(
        `A mission with the name "${request.name}" already exists for this starship`,
        'name'
      );
    }

    const mission = await missionRepo.createMission(request, userId);

    // Start mission orchestration (welcome message generation and setup)
    console.log('🚀 Starting mission orchestration for mission:', mission.id);
    try {
      const missionOrchestratorService = MissionOrchestratorService.getInstance();
      console.log('📡 MissionOrchestratorService obtained:', !!missionOrchestratorService);

      // Fire and forget - start mission orchestration
      missionOrchestratorService
        .startMission(mission.id)
        .then(() => {
          console.log('✅ Mission orchestration started successfully for mission:', mission.id);
        })
        .catch((error) => {
          console.error('❌ Failed to start mission orchestration:', error);
        });
    } catch (error) {
      console.error('❌ Failed to start mission orchestration:', error);
      // Silent fail - mission orchestration can be started later
    }

    return mission;
  }

  /**
   * Get mission by ID
   */
  static async getMissionById(id: string): Promise<MissionModel> {
    const missionRepo = new MissionRepository();
    return await missionRepo.getMissionById(id);
  }

  /**
   * Get all missions with filtering and sorting
   */
  static async getAllMissions(
    filters?: MissionFilters,
    sort?: MissionSort
  ): Promise<MissionListResponse> {
    const missionRepo = new MissionRepository();
    return await missionRepo.getAllMissions(filters, sort);
  }

  /**
   * Get missions for a specific starship
   */
  static async getMissionsByStarshipId(
    starshipId: string,
    filters?: MissionFilters,
    sort?: MissionSort
  ): Promise<MissionListResponse> {
    const missionRepo = new MissionRepository();
    const starshipRepo = new StarshipRepository();

    // Verify starship exists
    try {
      await starshipRepo.findById(starshipId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Starship not found', 'Starship', starshipId);
      }
      throw error;
    }

    return await missionRepo.getMissionModelsByStarshipId(starshipId, filters, sort);
  }

  /**
   * Update a mission
   */
  static async updateMission(id: string, updates: UpdateMissionRequest): Promise<MissionModel> {
    const missionRepo = new MissionRepository();
    const agentRepo = new AgentRepository();
    const missionEventService = MissionEventService.getInstance();

    // Get existing mission first
    const existingMission = await missionRepo.getMissionById(id);

    // Business logic validation for status transitions
    if (updates.status && updates.status !== existingMission.status) {
      this.validateStatusTransition(existingMission.status, updates.status);
    }

    // Validate agent assignments if being updated
    if (updates.agentIds) {
      for (const agentId of updates.agentIds) {
        try {
          const agent = await agentRepo.findById(agentId);
          if (!agent) {
            throw new NotFoundError('Agent not found', 'Agent', agentId);
          }
          if (agent.starshipId !== existingMission.starshipId) {
            throw new ValidationError(
              `Agent ${agentId} does not belong to mission's starship ${existingMission.starshipId}`,
              'agentIds'
            );
          }
        } catch (error) {
          if (error instanceof NotFoundError) {
            throw new NotFoundError('Agent not found', 'Agent', agentId);
          }
          throw error;
        }
      }
    }

    // If updating name, check for duplicates
    if (updates.name && updates.name !== existingMission.name) {
      const existingMissions = await missionRepo.getMissionModelsByStarshipId(
        existingMission.starshipId,
        { status: ['draft', 'active'] }
      );

      const duplicateName = existingMissions.missions.find(
        (mission: MissionModel) =>
          mission.id !== id && mission.name.toLowerCase() === updates.name!.toLowerCase()
      );

      if (duplicateName) {
        throw new ValidationError(
          `A mission with the name "${updates.name}" already exists for this starship`,
          'name'
        );
      }
    }

    const updatedMission = await missionRepo.updateMission(id, updates);

    // Emit real-time events for specific changes
    if (updates.status && updates.status !== existingMission.status) {
      missionEventService.emitStatusChange(id, updates.status, existingMission.status);
    }

    if (updates.phase && updates.phase !== existingMission.phase) {
      missionEventService.emitPhaseChange(id, updates.phase, existingMission.phase);
    }

    return updatedMission;
  }

  /**
   * Delete a mission
   */
  static async deleteMission(id: string): Promise<void> {
    const missionRepo = new MissionRepository();

    // Get existing mission to check business rules
    const existingMission = await missionRepo.getMissionById(id);

    // Business rule: Don't allow deletion of active missions
    if (existingMission.status === 'active') {
      throw new ValidationError('Cannot delete an active mission. Cancel it first.', 'status');
    }

    // TODO: Add authorization check if userId is provided
    // if (userId && existingMission.createdBy !== userId) {
    //   throw new UnauthorizedError('You can only delete missions you created');
    // }

    await missionRepo.deleteMissionModel(id);
  }

  /**
   * Start a mission (transition from draft to active)
   */
  static async startMission(id: string): Promise<MissionModel> {
    return await this.updateMission(id, { status: 'active' });
  }

  /**
   * Complete a mission (transition from active to completed)
   */
  static async completeMission(id: string): Promise<MissionModel> {
    return await this.updateMission(id, { status: 'completed' });
  }

  /**
   * Fail a mission (transition from active to failed)
   */
  static async failMission(id: string): Promise<MissionModel> {
    return await this.updateMission(id, { status: 'failed' });
  }

  /**
   * Cancel a mission (transition to cancelled from any status except completed)
   */
  static async cancelMission(id: string): Promise<MissionModel> {
    return await this.updateMission(id, { status: 'cancelled' });
  }

  /**
   * Update mission phase
   */
  static async updateMissionPhase(id: string, phase: MissionPhase): Promise<MissionModel> {
    return await this.updateMission(id, { phase });
  }

  /**
   * Get mission statistics for a starship
   */
  static async getMissionStats(starshipId: string): Promise<{
    total: number;
    byStatus: Record<MissionStatus, number>;
    recentMissions: MissionModel[];
  }> {
    const missionRepo = new MissionRepository();

    const allMissions = await missionRepo.getMissionModelsByStarshipId(starshipId);
    const missions = allMissions.missions;

    // Count by status
    const byStatus: Record<MissionStatus, number> = {
      draft: 0,
      active: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    missions.forEach((mission: MissionModel) => {
      byStatus[mission.status as MissionStatus]++;
    });

    // Get recent missions (last 5)
    const recentMissions = missions
      .sort(
        (a: MissionModel, b: MissionModel) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 5);

    return {
      total: missions.length,
      byStatus,
      recentMissions,
    };
  }

  /**
   * Validate status transitions according to business rules
   */
  private static validateStatusTransition(
    currentStatus: MissionStatus,
    newStatus: MissionStatus
  ): void {
    const validTransitions: Record<MissionStatus, MissionStatus[]> = {
      draft: ['active', 'cancelled'],
      active: ['completed', 'failed', 'cancelled'],
      completed: [], // No transitions from completed
      failed: ['active'], // Can restart a failed mission
      cancelled: ['draft'], // Can reopen a cancelled mission
    };

    const allowedTransitions = validTransitions[currentStatus];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition mission from "${currentStatus}" to "${newStatus}". Valid transitions: ${allowedTransitions.join(', ')}`,
        'status'
      );
    }
  }

  /**
   * Get mission clarity assessment
   */
  static async getMissionClarity(missionId: string): Promise<MissionClarityModel | null> {
    const missionRepo = new MissionRepository();
    const clarityRepo = new MissionClarityRepository();

    // Verify mission exists first
    try {
      await missionRepo.getMissionById(missionId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Mission not found', 'Mission', missionId);
      }
      throw error;
    }

    // Get clarity assessment (can be null if not yet assessed)
    return await clarityRepo.getByMissionId(missionId);
  }

  /**
   * Get workflow for a mission - temporary implementation using WorkflowService until MissionWorkflow is fully implemented
   */
  static async getWorkflowByMissionId(missionId: string): Promise<any | null> {
    const missionRepo = new MissionRepository();

    // Verify mission exists first
    try {
      await missionRepo.getMissionById(missionId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Mission not found', 'Mission', missionId);
      }
      throw error;
    }

    // TODO: This is a temporary implementation. In the future, this should query MissionWorkflow table
    // For now, we'll return null since there's no direct mission-workflow relationship in current schema
    return null;
  }

  /**
   * Update workflow approval status for a mission - temporary implementation
   */
  static async updateWorkflowApproval(
    missionId: string,
    approvalData: {
      approvalStatus: 'pending' | 'approved' | 'rejected';
      rejectionReason?: string;
    }
  ): Promise<any | null> {
    const missionRepo = new MissionRepository();

    // Verify mission exists first
    try {
      const mission = await missionRepo.getMissionById(missionId);

      // Update mission's approval status
      const updatedMission = await missionRepo.updateMission(missionId, {
        approvalStatus: approvalData.approvalStatus as any,
      });

      return updatedMission;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Mission not found', 'Mission', missionId);
      }
      throw error;
    }
  }
}
