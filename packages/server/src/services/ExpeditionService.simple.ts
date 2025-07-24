/**
 * Simplified Expedition Service - Basic Implementation
 * 
 * A working implementation of expedition management that integrates with
 * the existing repository layer and provides core functionality.
 */

import { RepositoryFactory } from '@starships/models';

export class ExpeditionService {
  private static instance: ExpeditionService;

  private constructor() {
    // SocketIOService will be initialized lazily to avoid initialization order issues
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
  async createExpedition(userId: string, request: any) {
    console.log(`[EXPEDITION-SERVICE] Creating expedition for starship: ${request.starshipId}`);

    try {
      // Validate starship ownership
      await this.validateStarshipOwnership(request.starshipId, userId);

      // Create expedition
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.create({
        starshipId: request.starshipId,
        title: request.title,
        description: request.description,
        objective: request.objective,
        status: 'draft',
        priority: request.priority || 'medium',
        assignedAgents: [],
        createdBy: userId,
        estimatedDuration: request.estimatedDuration,
        tags: request.tags || [],
        updatedAt: new Date().toISOString()
      });

      // Get assigned agents info
      const assignedAgents = await this.getAssignedAgentsInfo(expedition.assignedAgents);


      console.log(`[EXPEDITION-SERVICE] Expedition created: ${expedition.id}`);

      return {
        expedition,
        assignedAgents,
        tasks: [],
        messages: [],
        results: []
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to create expedition:', error);
      throw this.handleError(error, 'CREATE_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expedition by ID
   */
  async getExpedition(expeditionId: string, userId: string) {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access
      await this.validateExpeditionAccess(expedition, userId);

      // Get related data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(expedition.assignedAgents)
      ]);

      return {
        expedition,
        tasks,
        messages,
        results,
        assignedAgents
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to get expedition:', error);
      throw this.handleError(error, 'GET_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expeditions for a starship
   */
  async getExpeditions(starshipId: string, userId: string, filters?: any, sort?: any, pagination?: any) {
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
        filters
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to get expeditions:', error);
      throw this.handleError(error, 'GET_EXPEDITIONS_FAILED');
    }
  }

  /**
   * Update expedition
   */
  async updateExpedition(expeditionId: string, userId: string, updates: any) {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
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
        this.getAssignedAgentsInfo(updatedExpedition.assignedAgents)
      ]);


      return {
        expedition: updatedExpedition,
        tasks,
        messages,
        results,
        assignedAgents
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
  async startExpedition(expeditionId: string, userId: string) {
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

      // Get updated data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(updatedExpedition.assignedAgents)
      ]);


      console.log(`[EXPEDITION-SERVICE] Expedition started: ${expeditionId}`);

      return {
        expedition: updatedExpedition,
        tasks,
        messages,
        results,
        assignedAgents
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to start expedition:', error);
      throw this.handleError(error, 'START_EXPEDITION_FAILED');
    }
  }

  /**
   * Pause expedition
   */
  async pauseExpedition(expeditionId: string, userId: string) {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and pause conditions
      await this.validateExpeditionAccess(expedition, userId);
      this.validateExpeditionPause(expedition);

      // Update status to review (paused state)
      const updatedExpedition = await expeditionRepo.updateStatus(expeditionId, 'review');

      // Get updated data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(updatedExpedition!.assignedAgents)
      ]);


      return {
        expedition: updatedExpedition!,
        tasks,
        messages,
        results,
        assignedAgents
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to pause expedition:', error);
      throw this.handleError(error, 'PAUSE_EXPEDITION_FAILED');
    }
  }

  /**
   * Resume expedition
   */
  async resumeExpedition(expeditionId: string, userId: string) {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and resume conditions
      await this.validateExpeditionAccess(expedition, userId);
      this.validateExpeditionResume(expedition);

      // Update status to in-progress
      const updatedExpedition = await expeditionRepo.updateStatus(expeditionId, 'in-progress');

      // Get updated data
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.getExpeditionTasks(expeditionId),
        this.getExpeditionMessages(expeditionId),
        this.getExpeditionResults(expeditionId),
        this.getAssignedAgentsInfo(updatedExpedition!.assignedAgents)
      ]);


      return {
        expedition: updatedExpedition!,
        tasks,
        messages,
        results,
        assignedAgents
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

      // Update status to cancelled
      await expeditionRepo.updateStatus(expeditionId, 'cancelled');


      console.log(`[EXPEDITION-SERVICE] Expedition cancelled: ${expeditionId}`);
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to cancel expedition:', error);
      throw this.handleError(error, 'CANCEL_EXPEDITION_FAILED');
    }
  }

  // Private helper methods

  private async validateStarshipOwnership(starshipId: string, userId: string): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (!starship) {
      throw this.createError('STARSHIP_NOT_FOUND', `Starship not found: ${starshipId}`);
    }

    if (starship.ownerId !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to starship');
    }
  }

  private async validateExpeditionAccess(expedition: any, userId: string): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(expedition.starshipId);

    if (!starship || starship.ownerId !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to expedition');
    }
  }

  private validateExpeditionModification(expedition: any): void {
    if (['in-progress', 'completed', 'failed'].includes(expedition.status)) {
      throw this.createError('EXPEDITION_CANNOT_MODIFY', 'Cannot modify expedition in current status');
    }
  }

  private validateExpeditionDeletion(expedition: any): void {
    if (['in-progress', 'planning'].includes(expedition.status)) {
      throw this.createError('EXPEDITION_CANNOT_DELETE', 'Cannot delete active expedition');
    }
  }

  private validateExpeditionStart(expedition: any): void {
    if (expedition.status !== 'draft') {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Expedition must be in draft status to start');
    }
  }

  private validateExpeditionPause(expedition: any): void {
    if (!['planning', 'in-progress'].includes(expedition.status)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Can only pause active expeditions');
    }
  }

  private validateExpeditionResume(expedition: any): void {
    if (!['review'].includes(expedition.status)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Invalid expedition status for resume');
    }
  }

  private validateExpeditionCancel(expedition: any): void {
    if (['completed', 'failed', 'cancelled'].includes(expedition.status)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Cannot cancel expedition in current status');
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
    const agents = await Promise.all(
      agentIds.map(id => agentRepo.findById(id))
    );

    return agents
      .filter(agent => agent !== null)
      .map(agent => ({
        id: agent!.id,
        name: agent!.name,
        category: agent!.category,
        tags: agent!.tags
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

  private createError(code: string, message: string): any {
    return {
      code,
      message,
      details: undefined
    };
  }

  private handleError(error: any, fallbackCode: string): any {
    if (error.code) {
      return error;
    }

    return {
      code: fallbackCode,
      message: error.message || 'Unknown error occurred',
      details: error
    };
  }

}