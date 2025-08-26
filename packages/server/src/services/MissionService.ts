/**
 * Mission Service
 * Business logic layer for mission operations
 */

import { RepositoryFactory } from '@starships/models';
import { MissionOrchestratorService } from './MissionOrchestratorService';
import { MissionEventService } from './MissionEventService';
import type {
  Mission,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort,
  MissionListResponse,
  MissionStatus,
  MissionPhase,
  MissionClarity
} from '@starships/protocol';
import {
  ValidationError,
  NotFoundError,
} from '@starships/models';

export class MissionService {
  
  /**
   * Create a new mission
   */
  static async createMission(request: CreateMissionRequest, userId: string): Promise<Mission> {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const agentRepo = RepositoryFactory.getAgentRepository();

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
    const existingMissions = await missionRepo.getMissionsByStarshipId(
      request.starshipId,
      { status: ['draft', 'active'] } // Only check active missions
    );

    const duplicateName = existingMissions.missions.find(
      (mission: Mission) => mission.name.toLowerCase() === request.name.toLowerCase()
    );

    if (duplicateName) {
      throw ValidationError.fromFields([{
        field: 'name',
        message: `A mission with the name "${request.name}" already exists for this starship`
      }]);
    }

    const mission = await missionRepo.createMission(request, userId);

    // Start mission orchestration (welcome message generation and setup)
    console.log('🚀 Starting mission orchestration for mission:', mission.id);
    try {
      const missionOrchestratorService = MissionOrchestratorService.getInstance();
      console.log('📡 MissionOrchestratorService obtained:', !!missionOrchestratorService);
      
      // Fire and forget - start mission orchestration
      missionOrchestratorService.startMission(mission.id)
        .then(() => {
          console.log('✅ Mission orchestration started successfully for mission:', mission.id);
        })
        .catch(error => {
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
  static async getMissionById(id: string): Promise<Mission> {
    const missionRepo = RepositoryFactory.getMissionRepository();
    return await missionRepo.getMissionById(id);
  }

  /**
   * Get all missions with filtering and sorting
   */
  static async getAllMissions(
    filters?: MissionFilters,
    sort?: MissionSort
  ): Promise<MissionListResponse> {
    const missionRepo = RepositoryFactory.getMissionRepository();
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
    const missionRepo = RepositoryFactory.getMissionRepository();
    const starshipRepo = RepositoryFactory.getStarshipRepository();

    // Verify starship exists
    try {
      await starshipRepo.findById(starshipId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Starship not found', 'Starship', starshipId);
      }
      throw error;
    }

    return await missionRepo.getMissionsByStarshipId(starshipId, filters, sort);
  }

  /**
   * Update a mission
   */
  static async updateMission(
    id: string,
    updates: UpdateMissionRequest,
    userId?: string
  ): Promise<Mission> {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const agentRepo = RepositoryFactory.getAgentRepository();
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
            throw ValidationError.fromFields([{
              field: 'agentIds',
              message: `Agent ${agentId} does not belong to mission's starship ${existingMission.starshipId}`
            }]);
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
      const existingMissions = await missionRepo.getMissionsByStarshipId(
        existingMission.starshipId,
        { status: ['draft', 'active'] }
      );

      const duplicateName = existingMissions.missions.find(
        (mission: Mission) =>
          mission.id !== id &&
          mission.name.toLowerCase() === updates.name!.toLowerCase()
      );

      if (duplicateName) {
        throw ValidationError.fromFields([{
          field: 'name',
          message: `A mission with the name "${updates.name}" already exists for this starship`
        }]);
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
  static async deleteMission(id: string, userId?: string): Promise<void> {
    const missionRepo = RepositoryFactory.getMissionRepository();

    // Get existing mission to check business rules
    const existingMission = await missionRepo.getMissionById(id);

    // Business rule: Don't allow deletion of active missions
    if (existingMission.status === 'active') {
      throw ValidationError.fromFields([{
        field: 'status',
        message: 'Cannot delete an active mission. Cancel it first.'
      }]);
    }

    // TODO: Add authorization check if userId is provided
    // if (userId && existingMission.createdBy !== userId) {
    //   throw new UnauthorizedError('You can only delete missions you created');
    // }

    await missionRepo.deleteMission(id);
  }

  /**
   * Start a mission (transition from draft to active)
   */
  static async startMission(id: string, userId?: string): Promise<Mission> {
    return await this.updateMission(id, { status: 'active' }, userId);
  }

  /**
   * Complete a mission (transition from active to completed)
   */
  static async completeMission(id: string, userId?: string): Promise<Mission> {
    return await this.updateMission(id, { status: 'completed' }, userId);
  }

  /**
   * Fail a mission (transition from active to failed)
   */
  static async failMission(id: string, userId?: string): Promise<Mission> {
    return await this.updateMission(id, { status: 'failed' }, userId);
  }

  /**
   * Cancel a mission (transition to cancelled from any status except completed)
   */
  static async cancelMission(id: string, userId?: string): Promise<Mission> {
    return await this.updateMission(id, { status: 'cancelled' }, userId);
  }

  /**
   * Update mission phase
   */
  static async updateMissionPhase(id: string, phase: MissionPhase, userId?: string): Promise<Mission> {
    return await this.updateMission(id, { phase }, userId);
  }

  /**
   * Get mission statistics for a starship
   */
  static async getMissionStats(starshipId: string): Promise<{
    total: number;
    byStatus: Record<MissionStatus, number>;
    recentMissions: Mission[];
  }> {
    const missionRepo = RepositoryFactory.getMissionRepository();
    
    const allMissions = await missionRepo.getMissionsByStarshipId(starshipId);
    const missions = allMissions.missions;

    // Count by status
    const byStatus: Record<MissionStatus, number> = {
      draft: 0,
      active: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    missions.forEach((mission: Mission) => {
      byStatus[mission.status as MissionStatus]++;
    });

    // Get recent missions (last 5)
    const recentMissions = missions
      .sort((a: Mission, b: Mission) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);

    return {
      total: missions.length,
      byStatus,
      recentMissions
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
      cancelled: ['draft'] // Can reopen a cancelled mission
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
  static async getMissionClarity(missionId: string): Promise<MissionClarity | null> {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const clarityRepo = RepositoryFactory.getMissionClarityRepository();

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
}