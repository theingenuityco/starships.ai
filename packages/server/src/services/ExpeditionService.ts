/**
 * Expedition Service - Orchestration Layer
 *
 * Main service that orchestrates expedition management by coordinating
 * the specialized services for lifecycle, tasks, agents, and validation.
 * Refactored to use composition instead of handling everything directly.
 */

import {
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
  ErrorFactory,
} from '@starships/protocol/src/types/error-classes';

import { FirstOfficerService } from './FirstOfficerService';

// Import the extracted services
import { ExpeditionLifecycleService } from './ExpeditionLifecycleService';
import { TaskOrchestrationService } from './TaskOrchestrationService';
import { AgentCoordinationService } from './AgentCoordinationService';
import { ExpeditionValidationService } from './ExpeditionValidationService';

export class ExpeditionService {
  private static instance: ExpeditionService;
  private firstOfficerService: FirstOfficerService;

  // Composed services
  private lifecycleService: ExpeditionLifecycleService;
  private taskOrchestrationService: TaskOrchestrationService;
  private agentCoordinationService: AgentCoordinationService;
  private validationService: ExpeditionValidationService;

  private constructor() {
    this.firstOfficerService = FirstOfficerService.getInstance();
    
    // Initialize the composed services
    this.lifecycleService = ExpeditionLifecycleService.getInstance();
    this.taskOrchestrationService = TaskOrchestrationService.getInstance();
    this.agentCoordinationService = AgentCoordinationService.getInstance();
    this.validationService = ExpeditionValidationService.getInstance();
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
      // Step 1: Validate the creation request (includes all validation logic)
      await this.validationService.validateCreationRequest(userId, request);
      
      // Step 2: Validate selected agents
      await this.agentCoordinationService.validateSelectedAgents(request.starshipId, request.selectedAgents);
      
      // Step 3: Create the expedition using lifecycle service
      const finalExpedition = await this.lifecycleService.createExpedition(
        userId, 
        request, 
        request.selectedAgents
      );

      // Step 4: Get related data using task orchestration and agent coordination
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.taskOrchestrationService.getExpeditionTasks(finalExpedition.id),
        this.taskOrchestrationService.getExpeditionMessages(finalExpedition.id),
        this.taskOrchestrationService.getExpeditionResults(finalExpedition.id),
        this.agentCoordinationService.getAssignedAgentsInfo(finalExpedition.assignedAgents),
      ]);

      console.log(`[EXPEDITION-SERVICE] Expedition created successfully: ${finalExpedition.id}`);

      return {
        expedition: finalExpedition,
        assignedAgents,
        tasks,
        messages,
        results,
      };
    } catch (error) {
      console.error('[EXPEDITION-SERVICE] Failed to create expedition:', error);
      throw this.handleError(error, 'CREATE_EXPEDITION_FAILED');
    }
  }

  /**
   * Get expedition by ID
   */
  async getExpedition(expeditionId: string, userId: string): Promise<ExpeditionResponse> {
    try {
      // Get the expedition using lifecycle service
      const expedition = await this.lifecycleService.getExpedition(expeditionId);
      
      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access
      await this.validationService.validateExpeditionAccess(expedition, userId);

      // Get related data using specialized services
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.taskOrchestrationService.getExpeditionTasks(expeditionId),
        this.taskOrchestrationService.getExpeditionMessages(expeditionId),
        this.taskOrchestrationService.getExpeditionResults(expeditionId),
        this.agentCoordinationService.getAssignedAgentsInfo(expedition.assignedAgents),
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
      await this.validationService.validateStarshipOwnership(starshipId, userId);

      // Get expeditions using lifecycle service
      const { expeditions, total } = await this.lifecycleService.getExpeditions(
        starshipId,
        filters,
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
      // Get current expedition
      const expedition = await this.lifecycleService.getExpedition(expeditionId);
      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and modification rights
      await this.validationService.validateExpeditionAccess(expedition, userId);
      this.validationService.validateExpeditionModification(expedition);

      // Update expedition using lifecycle service
      const updatedExpedition = await this.lifecycleService.updateExpedition(expeditionId, updates);
      if (!updatedExpedition) {
        throw this.createError('UPDATE_FAILED', 'Failed to update expedition');
      }

      // Get updated data using specialized services
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.taskOrchestrationService.getExpeditionTasks(expeditionId),
        this.taskOrchestrationService.getExpeditionMessages(expeditionId),
        this.taskOrchestrationService.getExpeditionResults(expeditionId),
        this.agentCoordinationService.getAssignedAgentsInfo(updatedExpedition.assignedAgents),
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
      // Get current expedition
      const expedition = await this.lifecycleService.getExpedition(expeditionId);
      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and deletion rights
      await this.validationService.validateExpeditionAccess(expedition, userId);
      this.validationService.validateExpeditionDeletion(expedition);

      // Delete expedition using lifecycle service
      await this.lifecycleService.deleteExpedition(expeditionId);

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
      // Get current expedition
      const expedition = await this.lifecycleService.getExpedition(expeditionId);
      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and start conditions
      await this.validationService.validateExpeditionAccess(expedition, userId);
      this.validationService.validateExpeditionStart(expedition);

      // Update status to planning using lifecycle service
      const updatedExpedition = await this.lifecycleService.updateStatus(expeditionId, 'planning');
      if (!updatedExpedition) {
        throw this.createError('STATUS_UPDATE_FAILED', 'Failed to update expedition status');
      }

      // Start First Officer orchestration
      await this.firstOfficerService.startExpedition(expeditionId, userId, expedition.mission);

      // Get updated data using specialized services
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.taskOrchestrationService.getExpeditionTasks(expeditionId),
        this.taskOrchestrationService.getExpeditionMessages(expeditionId),
        this.taskOrchestrationService.getExpeditionResults(expeditionId),
        this.agentCoordinationService.getAssignedAgentsInfo(updatedExpedition.assignedAgents),
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
      // Get current expedition
      const expedition = await this.lifecycleService.getExpedition(expeditionId);
      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and pause conditions
      await this.validationService.validateExpeditionAccess(expedition, userId);
      this.validationService.validateExpeditionPause(expedition);

      // Pause First Officer orchestration
      await this.firstOfficerService.pauseExpedition(expeditionId);

      // Get updated expedition
      const updatedExpedition = await this.lifecycleService.getExpedition(expeditionId);
      if (!updatedExpedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found after pause: ${expeditionId}`);
      }

      // Get updated data using specialized services
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.taskOrchestrationService.getExpeditionTasks(expeditionId),
        this.taskOrchestrationService.getExpeditionMessages(expeditionId),
        this.taskOrchestrationService.getExpeditionResults(expeditionId),
        this.agentCoordinationService.getAssignedAgentsInfo(updatedExpedition.assignedAgents),
      ]);

      return {
        expedition: updatedExpedition,
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
      // Get current expedition
      const expedition = await this.lifecycleService.getExpedition(expeditionId);
      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and resume conditions
      await this.validationService.validateExpeditionAccess(expedition, userId);
      this.validationService.validateExpeditionResume(expedition);

      // Resume First Officer orchestration
      await this.firstOfficerService.resumeExpedition(expeditionId, userId);

      // Get updated expedition
      const updatedExpedition = await this.lifecycleService.getExpedition(expeditionId);
      if (!updatedExpedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found after resume: ${expeditionId}`);
      }

      // Get updated data using specialized services
      const [tasks, messages, results, assignedAgents] = await Promise.all([
        this.taskOrchestrationService.getExpeditionTasks(expeditionId),
        this.taskOrchestrationService.getExpeditionMessages(expeditionId),
        this.taskOrchestrationService.getExpeditionResults(expeditionId),
        this.agentCoordinationService.getAssignedAgentsInfo(updatedExpedition.assignedAgents),
      ]);

      return {
        expedition: updatedExpedition,
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
      // Get current expedition
      const expedition = await this.lifecycleService.getExpedition(expeditionId);
      if (!expedition) {
        throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
      }

      // Validate access and cancel conditions
      await this.validationService.validateExpeditionAccess(expedition, userId);
      this.validationService.validateExpeditionCancel(expedition);

      // Cancel First Officer orchestration
      await this.firstOfficerService.cancelExpedition(expeditionId);

      // Update status to cancelled using lifecycle service
      await this.lifecycleService.updateStatus(expeditionId, 'cancelled');

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
      await this.validationService.validateStarshipOwnership(starshipId, userId);

      // Get stats using lifecycle service
      return await this.lifecycleService.getExpeditionStats(starshipId);
    } catch (error: any) {
      console.error('[EXPEDITION-SERVICE] Failed to get expedition stats:', error);
      throw this.handleError(error, 'GET_STATS_FAILED');
    }
  }

  // Private helper methods (simplified after service extraction)

  private createError(code: string, message: string, expeditionId?: string): ExpeditionError {
    return ErrorFactory.expedition(code as any, message, expeditionId, {
      service: 'expedition-orchestration-service',
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
        service: 'expedition-orchestration-service',
        operation: 'error_handling',
        metadata: { originalError: error.toString() },
      }
    );
  }
}
