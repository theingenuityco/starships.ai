/**
 * Expedition Service - Business Logic Layer
 *
 * Handles all business logic for expedition management including CRUD operations,
 * validation, status transitions, and integration with First Officer Agent.
 */

import {
  Expedition,
  ExpeditionStatus,
  CreateExpeditionRequest,
  UpdateExpeditionRequest,
  ExpeditionFilters,
  ExpeditionSort,
  PaginationOptions,
  ExpeditionResponse,
  ExpeditionListResponse,
  ExpeditionStatsResponse,
} from '@starships/protocol';

import {
  StandardError,
  ExpeditionError,
  StarshipError,
  NotFoundError,
  AuthorizationError,
  BusinessLogicError,
  ErrorFactory,
} from '@starships/protocol/src/types/error-classes';

import { getLogger } from '../utils/logger';
import { RepositoryFactory } from '@starships/models';
import { FirstOfficerService } from './FirstOfficerService';
import { SocketIOService } from './SocketIOService';

export class ExpeditionService {
  private static instance: ExpeditionService;
  private firstOfficerService: FirstOfficerService;
  private socketService: SocketIOService | null = null;
  private logger = getLogger({
    service: 'expedition-service',
  });

  private constructor() {
    this.firstOfficerService = FirstOfficerService.getInstance();
    // Note: SocketIOService will be accessed lazily when needed
  }

  /**
   * Get SocketIOService instance lazily
   */
  private getSocketService(): SocketIOService | null {
    if (!this.socketService) {
      try {
        this.socketService = SocketIOService.getInstance();
        this.logger.info('SocketIOService successfully connected');
      } catch (error) {
        this.logger.warn('SocketIOService not available', undefined, { error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    }
    return this.socketService;
  }


  static getInstance(): ExpeditionService {
    if (!ExpeditionService.instance) {
      ExpeditionService.instance = new ExpeditionService();
    }
    return ExpeditionService.instance;
  }

  /**
   * Create a new expedition
   */
  async createExpedition(
    userId: string,
    request: CreateExpeditionRequest
  ): Promise<ExpeditionResponse> {
    console.log(`[EXPEDITION-SERVICE] Creating expedition for starship: ${request.starshipId}`, {
      userId,
      request,
      timestamp: new Date().toISOString(),
    });

    try {
      console.log(`[EXPEDITION-SERVICE] Step 1: Validating agent selection requirement`);
      // MANDATORY: Validate that agents are selected
      if (!request.selectedAgents || request.selectedAgents.length === 0) {
        throw this.createError(
          'VALIDATION_ERROR',
          'Agent selection is required. At least one agent must be selected for the expedition.'
        );
      }
      console.log(`[EXPEDITION-SERVICE] Step 1: Agent selection validated - ${request.selectedAgents.length} agents selected`);

      console.log(`[EXPEDITION-SERVICE] Step 2: Validating starship ownership`);
      // Validate starship ownership
      await this.validateStarshipOwnership(request.starshipId, userId);
      console.log(`[EXPEDITION-SERVICE] Step 2: Starship ownership validated successfully`);

      console.log(`[EXPEDITION-SERVICE] Step 3: Validating starship status`);
      // Validate starship status
      await this.validateStarshipStatus(request.starshipId);
      console.log(`[EXPEDITION-SERVICE] Step 3: Starship status validated successfully`);

      console.log(`[EXPEDITION-SERVICE] Step 4: Validating selected agents`);
      // Validate selected agents belong to the starship and are deployed
      await this.validateSelectedAgents(request.starshipId, request.selectedAgents);
      console.log(`[EXPEDITION-SERVICE] Step 4: Selected agents validated successfully`);

      console.log(`[EXPEDITION-SERVICE] Step 5: Getting expedition repository`);
      // Create expedition
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      console.log(`[EXPEDITION-SERVICE] Step 5: Expedition repository obtained successfully`);

      console.log(`[EXPEDITION-SERVICE] Step 6: Creating expedition in database`);
      const expeditionData = {
        starshipId: request.starshipId,
        name: request.name,
        mission: request.mission,
        status: 'draft' as const,
        assignedAgents: [], // Will be populated in next step
        createdBy: userId,
        updatedAt: new Date().toISOString(),
      };
      console.log(`[EXPEDITION-SERVICE] Step 6: Expedition data prepared:`, expeditionData);

      const expedition = await expeditionRepo.create(expeditionData);
      console.log(`[EXPEDITION-SERVICE] Step 6: Expedition created in database:`, expedition);

      console.log(`[EXPEDITION-SERVICE] Step 7: Assigning selected agents to expedition`);
      // Assign each selected agent to the expedition (required step)
      for (const agentId of request.selectedAgents) {
        console.log(`[EXPEDITION-SERVICE] Step 7a: Assigning agent ${agentId} to expedition ${expedition.id}`);
        await expeditionRepo.assignAgent(expedition.id, agentId);
      }
      
      // Get updated expedition with assigned agents
      const finalExpedition = await expeditionRepo.findById(expedition.id);
      if (!finalExpedition) {
        throw this.createError('UPDATE_FAILED', 'Failed to retrieve updated expedition after agent assignment');
      }
      console.log(`[EXPEDITION-SERVICE] Step 7: All agents assigned successfully. Updated expedition:`, finalExpedition);

      console.log(`[EXPEDITION-SERVICE] Step 8: Getting assigned agents info`);
      // Get assigned agents info
      const assignedAgents = await this.getAssignedAgentsInfo(finalExpedition.assignedAgents);
      console.log(`[EXPEDITION-SERVICE] Step 8: Assigned agents info retrieved:`, assignedAgents);

      // Emit expedition created event
      const socketService = this.getSocketService();
      if (socketService) {
        const expeditionRoom = `expedition:${finalExpedition.id}`;
        socketService.getIO().to(expeditionRoom).emit('expedition:created' as any, {
          expedition: finalExpedition,
          assignedAgents,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`[EXPEDITION-SERVICE] Expedition created successfully: ${finalExpedition.id}`);

      return {
        expedition: finalExpedition,
        assignedAgents,
        tasks: [],
        messages: [],
        results: [],
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to create expedition - Enhanced Debug:', {
        error,
        errorMessage: (error as any)?.message,
        errorCode: (error as any)?.code,
        errorStack: (error as any)?.stack,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        userId,
        request,
        timestamp: new Date().toISOString(),
      });
      throw this.handleError(error, 'CREATE_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expedition by ID
   */
  async getExpedition(expeditionId: string, userId: string): Promise<ExpeditionResponse> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw ErrorFactory.notFound('Expedition', expeditionId, {
          service: 'expedition-service',
          operation: 'get_expedition',
        });
      }

      // Validate access
      await this.validateExpeditionAccess(expedition, userId);

      // Get related data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(expedition.assignedAgents),
      ]);

      return {
        expedition,
        tasks,
        messages,
        results,
        assignedAgents,
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to get expedition:', error);
      throw this.handleError(error, 'GET_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expeditions for a starship
   */
  async getExpeditions(
    starshipId: string,
    userId: string,
    filters?: ExpeditionFilters,
    sort?: ExpeditionSort,
    pagination?: PaginationOptions
  ): Promise<ExpeditionListResponse> {
    try {
      // Validate starship ownership
      await this.validateStarshipOwnership(starshipId, userId);

      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const { expeditions, total } = await expeditionRepo.findWithFilters(
        starshipId,
        filters || {},
        sort,
        pagination
      );

      return {
        expeditions,
        total,
        page: pagination?.page || 1,
        limit: pagination?.limit || 20,
        filters,
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to get expeditions:', error);
      throw this.handleError(error, 'GET_EXPEDITIONS_FAILED');
    }
  }

  /**
   * Update expedition
   */
  async updateExpedition(
    expeditionId: string,
    userId: string,
    updates: UpdateExpeditionRequest
  ): Promise<ExpeditionResponse> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw ErrorFactory.notFound('Expedition', expeditionId, {
          service: 'expedition-service',
          operation: 'update_expedition',
        });
      }

      // Validate access and modification rights
      await this.validateExpeditionAccess(expedition, userId);
      this.validateExpeditionModification(expedition);

      // Update expedition
      const updatedExpedition = await expeditionRepo.update(expeditionId, updates);
      if (!updatedExpedition) {
        throw this.createError('UPDATE_FAILED', 'Failed to update expedition');
      }

      // Get updated data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(updatedExpedition.assignedAgents),
      ]);


      return {
        expedition: updatedExpedition,
        tasks,
        messages,
        results,
        assignedAgents,
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to update expedition:', error);
      throw this.handleError(error, 'UPDATE_EXPEDITION_FAILED');
    }
  }

  /**
   * Delete expedition
   */
  async deleteExpedition(expeditionId: string, userId: string): Promise<void> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and deletion rights
      await this.validateExpeditionAccess(expedition, userId);
      this.validateExpeditionDeletion(expedition);

      // Delete expedition and related data
      await this.deleteExpeditionData(expeditionId);


      console.log(`[EXPEDITION-SERVICE] Expedition deleted: ${expeditionId}`);
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to delete expedition:', error);
      throw this.handleError(error, 'DELETE_EXPEDITION_FAILED');
    }
  }

  /**
   * Start expedition
   */
  async startExpedition(expeditionId: string, userId: string): Promise<ExpeditionResponse> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and start conditions
      await this.validateExpeditionAccess(expedition, userId);
      this.validateExpeditionStart(expedition);

      // Update status to planning
      const updatedExpedition = await expeditionRepo.updateStatus(expeditionId, 'planning');
      if (!updatedExpedition) {
        throw this.createError('STATUS_UPDATE_FAILED', 'Failed to update expedition status');
      }

      // Emit status change event
      const socketService = this.getSocketService();
      if (socketService) {
        const expeditionRoom = `expedition:${expeditionId}`;
        socketService.getIO().to(expeditionRoom).emit('expedition:status-changed' as any, {
          expeditionId,
          status: 'planning',
          userId,
          timestamp: new Date().toISOString()
        });
      }

      // Start First Officer orchestration
      await this.firstOfficerService.startExpedition(expeditionId, userId, expedition.mission);

      // Get updated data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(updatedExpedition.assignedAgents),
      ]);


      console.log(`[EXPEDITION-SERVICE] Expedition started: ${expeditionId}`);

      return {
        expedition: updatedExpedition,
        tasks,
        messages,
        results,
        assignedAgents,
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to start expedition:', error);
      throw this.handleError(error, 'START_EXPEDITION_FAILED');
    }
  }

  /**
   * Pause expedition
   */
  async pauseExpedition(expeditionId: string, userId: string): Promise<ExpeditionResponse> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and pause conditions
      await this.validateExpeditionAccess(expedition, userId);
      this.validateExpeditionPause(expedition);

      // Pause First Officer orchestration
      await this.firstOfficerService.pauseExpedition(expeditionId);

      // Update status (First Officer will handle the actual status update)
      const updatedExpedition = await expeditionRepo.findById(expeditionId);

      // Get updated data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(updatedExpedition!.assignedAgents),
      ]);


      return {
        expedition: updatedExpedition!,
        tasks,
        messages,
        results,
        assignedAgents,
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to pause expedition:', error);
      throw this.handleError(error, 'PAUSE_EXPEDITION_FAILED');
    }
  }

  /**
   * Resume expedition
   */
  async resumeExpedition(expeditionId: string, userId: string): Promise<ExpeditionResponse> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and resume conditions
      await this.validateExpeditionAccess(expedition, userId);
      this.validateExpeditionResume(expedition);

      // Resume First Officer orchestration
      await this.firstOfficerService.resumeExpedition(expeditionId);

      // Get updated expedition
      const updatedExpedition = await expeditionRepo.findById(expeditionId);

      // Get updated data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(updatedExpedition!.assignedAgents),
      ]);


      return {
        expedition: updatedExpedition!,
        tasks,
        messages,
        results,
        assignedAgents,
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to resume expedition:', error);
      throw this.handleError(error, 'RESUME_EXPEDITION_FAILED');
    }
  }

  /**
   * Cancel expedition
   */
  async cancelExpedition(expeditionId: string, userId: string): Promise<void> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and cancel conditions
      await this.validateExpeditionAccess(expedition, userId);
      this.validateExpeditionCancel(expedition);

      // Cancel First Officer orchestration
      await this.firstOfficerService.cancelExpedition(expeditionId);

      // Update status to cancelled
      await expeditionRepo.updateStatus(expeditionId, 'cancelled');


      console.log(`[EXPEDITION-SERVICE] Expedition cancelled: ${expeditionId}`);
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to cancel expedition:', error);
      throw this.handleError(error, 'CANCEL_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expedition statistics
   */
  async getExpeditionStats(starshipId: string, userId: string): Promise<ExpeditionStatsResponse> {
    try {
      // Validate starship ownership
      await this.validateStarshipOwnership(starshipId, userId);

      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const stats = await expeditionRepo.getExpeditionStats(starshipId);

      // Get top performing agents (placeholder implementation)
      const topPerformingAgents = await this.getTopPerformingAgents(starshipId);

      // Ensure all values are properly converted to numbers (defensive programming)
      return {
        totalExpeditions: Number(stats.total),
        activeExpeditions: Number(stats.active),
        completedExpeditions: Number(stats.completed),
        failedExpeditions: Number(stats.failed),
        averageDuration: Number(stats.averageDuration),
        successRate: Number(stats.successRate),
        topPerformingAgents,
      };
    } catch (error: any) {
      console.error('[EXPEDITION-SERVICE] Failed to get expedition stats:', error);

      // If starship not found, return empty stats instead of throwing
      if (error.code === 'STARSHIP_NOT_FOUND') {
        console.warn(
          `[EXPEDITION-SERVICE] Returning empty stats for non-existent starship: ${starshipId}`
        );
        return {
          totalExpeditions: 0,
          activeExpeditions: 0,
          completedExpeditions: 0,
          failedExpeditions: 0,
          averageDuration: 0,
          successRate: 0,
          topPerformingAgents: [],
        };
      }

      throw this.handleError(error, 'GET_STATS_FAILED');
    }
  }

  // Private helper methods

  private async validateStarshipOwnership(starshipId: string, userId: string): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();

    try {
      const starship = await starshipRepo.findById(starshipId);

      if (!starship) {
        this.logger.warn(`Starship not found: ${starshipId} for user: ${userId}`, {
          service: 'expedition-service',
          operation: 'validate_starship_ownership',
        });
        throw ErrorFactory.notFound('Starship', starshipId, {
          service: 'expedition-service',
          operation: 'validate_starship_ownership',
        });
      }

      if (starship.ownerId !== userId) {
        this.logger.warn(`Access denied to starship: ${starshipId} for user: ${userId}`, {
          service: 'expedition-service',
          operation: 'validate_starship_ownership',
        });
        throw ErrorFactory.authorization('Access denied to starship', {
          service: 'expedition-service',
          operation: 'validate_starship_ownership',
          resource: 'starship',
          resourceId: starshipId,
        });
      }
    } catch (error: any) {
      if (error.code) {
        throw error; // Re-throw our custom errors
      }

      console.error(`[EXPEDITION-SERVICE] Database error validating starship ownership:`, error);
      throw this.createError('STARSHIP_VALIDATION_FAILED', 'Failed to validate starship ownership');
    }
  }

  private async validateStarshipStatus(starshipId: string): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (starship?.status === 'inactive') {
      throw this.createError('STARSHIP_MAINTENANCE', 'Starship is in maintenance mode');
    }
  }

  /**
   * Validate that selected agents belong to the starship and are deployed
   */
  private async validateSelectedAgents(starshipId: string, selectedAgents: string[]): Promise<void> {
    if (!selectedAgents || selectedAgents.length === 0) {
      return; // No agents to validate
    }

    const agentRepo = RepositoryFactory.getAgentRepository();
    
    // Validate each selected agent
    for (const agentId of selectedAgents) {
      const agent = await agentRepo.findById(agentId);
      
      if (!agent) {
        throw this.createError('AGENT_NOT_AVAILABLE', `Agent not found: ${agentId}`);
      }
      
      // Check if agent belongs to the starship
      if (agent.starshipId !== starshipId) {
        throw this.createError('AGENT_NOT_AVAILABLE', `Agent ${agentId} does not belong to starship ${starshipId}`);
      }
      
      // Agent is available if it exists and belongs to the starship
      // No additional status check needed since agents are either deployed on a starship or not
    }
    
    console.log(`[EXPEDITION-SERVICE] All selected agents validated successfully for starship: ${starshipId}`);
  }

  private async validateExpeditionAccess(expedition: Expedition, userId: string): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(expedition.starshipId);

    if (!starship || starship.ownerId !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to expedition');
    }
  }

  private validateExpeditionModification(expedition: Expedition): void {
    if (['in-progress', 'completed', 'failed'].includes(expedition.status)) {
      throw this.createError(
        'EXPEDITION_CANNOT_MODIFY',
        'Cannot modify expedition in current status'
      );
    }
  }

  private validateExpeditionDeletion(expedition: Expedition): void {
    if (['in-progress', 'planning'].includes(expedition.status)) {
      throw this.createError('EXPEDITION_CANNOT_DELETE', 'Cannot delete active expedition');
    }
  }

  private validateExpeditionStart(expedition: Expedition): void {
    if (expedition.status !== 'draft') {
      throw this.createError(
        'INVALID_STATUS_TRANSITION',
        'Expedition must be in draft status to start'
      );
    }
  }

  private validateExpeditionPause(expedition: Expedition): void {
    if (!['planning', 'in-progress'].includes(expedition.status)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Can only pause active expeditions');
    }
  }

  private validateExpeditionResume(expedition: Expedition): void {
    // Resume logic would check for paused state when implemented
    if (!['planning', 'in-progress'].includes(expedition.status)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Invalid expedition status for resume');
    }
  }

  private validateExpeditionCancel(expedition: Expedition): void {
    if (['completed', 'failed', 'cancelled'].includes(expedition.status)) {
      throw this.createError(
        'INVALID_STATUS_TRANSITION',
        'Cannot cancel expedition in current status'
      );
    }
  }

  private async getExpeditionTasks(expeditionId: string) {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    return await taskRepo.findByExpedition(expeditionId);
  }

  private async getExpeditionMessages(expeditionId: string) {
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    return await messageRepo.findByExpedition(expeditionId);
  }

  private async getExpeditionResults(expeditionId: string) {
    const resultRepo = RepositoryFactory.getExpeditionResultRepository();
    return await resultRepo.findByExpedition(expeditionId);
  }

  private async getAssignedAgentsInfo(agentIds: string[]) {
    if (agentIds.length === 0) return [];

    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await Promise.all(agentIds.map((id) => agentRepo.findById(id)));

    return agents
      .filter((agent) => agent !== null)
      .map((agent) => ({
        id: agent!.id,
        name: agent!.name,
        category: agent!.category,
        tags: agent!.tags,
      }));
  }

  private async deleteExpeditionData(expeditionId: string): Promise<void> {
    // Delete in order: results, messages, tasks, expedition
    const resultRepo = RepositoryFactory.getExpeditionResultRepository();
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();

    await resultRepo.deleteByExpedition(expeditionId);
    await messageRepo.deleteByExpedition(expeditionId);
    await taskRepo.deleteByExpedition(expeditionId);
    await expeditionRepo.delete(expeditionId);
  }

  private async getTopPerformingAgents(starshipId: string) {
    // Placeholder implementation - would analyze agent performance
    return [];
  }

  private createError(code: string, message: string, expeditionId?: string): ExpeditionError {
    return ErrorFactory.expedition(code as any, message, expeditionId, {
      service: 'expedition-service',
      operation: 'error_creation',
    });
  }

  private handleError(error: any, fallbackCode: string, expeditionId?: string): ExpeditionError {
    // If it's already a StandardError, return as-is
    if (error instanceof StandardError) {
      return error;
    }

    // If it has a code property, try to create appropriate error
    if (error.code) {
      return this.createError(error.code, error.message || 'Unknown error occurred', expeditionId);
    }

    // Create fallback error
    return ErrorFactory.expedition(
      fallbackCode as any,
      error.message || 'Unknown error occurred',
      expeditionId,
      {
        service: 'expedition-service',
        operation: 'error_handling',
        metadata: { originalError: error.toString() },
      }
    );
  }
}
