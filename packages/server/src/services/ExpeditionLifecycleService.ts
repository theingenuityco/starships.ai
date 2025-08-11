/**
 * Expedition Lifecycle Service
 * 
 * Handles the core CRUD operations and lifecycle management for expeditions.
 * Separated from the main ExpeditionService to reduce complexity and improve maintainability.
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
  ExpeditionError,
  NotFoundError,
  ErrorFactory,
} from '@starships/protocol/src/types/error-classes';

import { Logger } from '../utils/logger';
import { RepositoryFactory } from '@starships/models';
import { SocketIOService } from './SocketIOService';

export class ExpeditionLifecycleService {
  private static instance: ExpeditionLifecycleService;
  private socketService: SocketIOService | null = null;
  private logger = Logger.getInstance();

  private constructor() {}

  static getInstance(): ExpeditionLifecycleService {
    if (!ExpeditionLifecycleService.instance) {
      ExpeditionLifecycleService.instance = new ExpeditionLifecycleService();
    }
    return ExpeditionLifecycleService.instance;
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
        this.logger.warn('SocketIOService not available', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        return null;
      }
    }
    return this.socketService;
  }

  /**
   * Create a new expedition
   */
  async createExpedition(
    userId: string,
    request: CreateExpeditionRequest,
    assignedAgents: string[]
  ): Promise<Expedition> {
    console.log(`[EXPEDITION-LIFECYCLE] Creating expedition for starship: ${request.starshipId}`, {
      userId,
      request,
      assignedAgents,
      timestamp: new Date().toISOString(),
    });

    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      
      const expeditionData = {
        starshipId: request.starshipId,
        name: request.name,
        mission: request.mission,
        status: 'draft' as const,
        assignedAgents: [], // Will be populated after agent assignment
        createdBy: userId,
        updatedAt: new Date().toISOString(),
      };

      const expedition = await expeditionRepo.create(expeditionData);
      console.log(`[EXPEDITION-LIFECYCLE] Expedition created in database:`, expedition);

      // Assign agents to the expedition
      for (const agentId of assignedAgents) {
        await expeditionRepo.assignAgent(expedition.id, agentId);
      }
      
      // Get updated expedition with assigned agents
      const finalExpedition = await expeditionRepo.findById(expedition.id);
      if (!finalExpedition) {
        throw this.createError('UPDATE_FAILED', 'Failed to retrieve updated expedition after agent assignment');
      }

      // Emit expedition created event
      const socketService = this.getSocketService();
      if (socketService) {
        const expeditionRoom = `expedition:${finalExpedition.id}`;
        socketService.getIO().to(expeditionRoom).emit('expedition:created' as any, {
          expedition: finalExpedition,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`[EXPEDITION-LIFECYCLE] Expedition created successfully: ${finalExpedition.id}`);
      return finalExpedition;
    } catch (error) {
      console.error('[EXPEDITION-LIFECYCLE] Failed to create expedition:', error);
      throw this.handleError(error, 'CREATE_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expedition by ID
   */
  async getExpedition(expeditionId: string): Promise<Expedition | null> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw ErrorFactory.notFound('Expedition', expeditionId, {
          service: 'expedition-lifecycle-service',
          operation: 'get_expedition',
        });
      }

      return expedition;
    } catch (error) {
      console.error('[EXPEDITION-LIFECYCLE] Failed to get expedition:', error);
      throw this.handleError(error, 'GET_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expeditions for a starship with filtering, sorting, and pagination
   */
  async getExpeditions(
    starshipId: string,
    filters?: ExpeditionFilters,
    sort?: ExpeditionSort,
    pagination?: PaginationOptions
  ): Promise<{ expeditions: Expedition[]; total: number }> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      return await expeditionRepo.findWithFilters(
        starshipId,
        filters || {},
        sort,
        pagination
      );
    } catch (error) {
      console.error('[EXPEDITION-LIFECYCLE] Failed to get expeditions:', error);
      throw this.handleError(error, 'GET_EXPEDITIONS_FAILED');
    }
  }

  /**
   * Update expedition
   */
  async updateExpedition(
    expeditionId: string,
    updates: UpdateExpeditionRequest
  ): Promise<Expedition | null> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw ErrorFactory.notFound('Expedition', expeditionId, {
          service: 'expedition-lifecycle-service',
          operation: 'update_expedition',
        });
      }

      const updatedExpedition = await expeditionRepo.update(expeditionId, updates);
      if (!updatedExpedition) {
        throw this.createError('UPDATE_FAILED', 'Failed to update expedition');
      }

      return updatedExpedition;
    } catch (error) {
      console.error('[EXPEDITION-LIFECYCLE] Failed to update expedition:', error);
      throw this.handleError(error, 'UPDATE_EXPEDITION_FAILED');
    }
  }

  /**
   * Update expedition status
   */
  async updateStatus(expeditionId: string, status: ExpeditionStatus): Promise<Expedition | null> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const updatedExpedition = await expeditionRepo.updateStatus(expeditionId, status);

      // Emit status change event
      const socketService = this.getSocketService();
      if (socketService) {
        const expeditionRoom = `expedition:${expeditionId}`;
        socketService.getIO().to(expeditionRoom).emit('expedition:status-changed' as any, {
          expeditionId,
          status,
          timestamp: new Date().toISOString()
        });
      }

      return updatedExpedition;
    } catch (error) {
      console.error('[EXPEDITION-LIFECYCLE] Failed to update expedition status:', error);
      throw this.handleError(error, 'UPDATE_STATUS_FAILED');
    }
  }

  /**
   * Delete expedition
   */
  async deleteExpedition(expeditionId: string): Promise<void> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Delete expedition and related data
      await this.deleteExpeditionData(expeditionId);
      console.log(`[EXPEDITION-LIFECYCLE] Expedition deleted: ${expeditionId}`);
    } catch (error) {
      console.error('[EXPEDITION-LIFECYCLE] Failed to delete expedition:', error);
      throw this.handleError(error, 'DELETE_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expedition statistics for a starship
   */
  async getExpeditionStats(starshipId: string): Promise<ExpeditionStatsResponse> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const stats = await expeditionRepo.getExpeditionStats(starshipId);

      // Get top performing agents (placeholder implementation)
      const topPerformingAgents = await this.getTopPerformingAgents(starshipId);

      // Ensure all values are properly converted to numbers
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
      console.error('[EXPEDITION-LIFECYCLE] Failed to get expedition stats:', error);

      // If starship not found, return empty stats instead of throwing
      if (error.code === 'STARSHIP_NOT_FOUND') {
        console.warn(
          `[EXPEDITION-LIFECYCLE] Returning empty stats for non-existent starship: ${starshipId}`
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
      service: 'expedition-lifecycle-service',
      operation: 'error_creation',
    });
  }

  private handleError(error: any, fallbackCode: string, expeditionId?: string): ExpeditionError {
    // If it's already a standard error, return as-is
    if (error.code) {
      return this.createError(error.code, error.message || 'Unknown error occurred', expeditionId);
    }

    // Create fallback error
    return ErrorFactory.expedition(
      fallbackCode as any,
      error.message || 'Unknown error occurred',
      expeditionId,
      {
        service: 'expedition-lifecycle-service',
        operation: 'error_handling',
        metadata: { originalError: error.toString() },
      }
    );
  }
}