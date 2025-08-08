/**
 * Expedition Validation Service
 * 
 * Handles all business rule validation for expeditions including access control,
 * status transitions, and business logic constraints.
 */

import {
  Expedition,
  ExpeditionStatus,
  CreateExpeditionRequest,
} from '@starships/protocol';

import {
  ExpeditionError,
  ErrorFactory,
} from '@starships/protocol/src/types/error-classes';

import { Logger } from '../utils/logger';
import { RepositoryFactory } from '@starships/models';

export class ExpeditionValidationService {
  private static instance: ExpeditionValidationService;
  private logger = Logger.getInstance();

  private constructor() {}

  static getInstance(): ExpeditionValidationService {
    if (!ExpeditionValidationService.instance) {
      ExpeditionValidationService.instance = new ExpeditionValidationService();
    }
    return ExpeditionValidationService.instance;
  }

  /**
   * Validate expedition creation request
   */
  async validateCreationRequest(userId: string, request: CreateExpeditionRequest): Promise<void> {
    console.log(`[EXPEDITION-VALIDATION] Validating creation request for starship: ${request.starshipId}`);

    try {
      // MANDATORY: Validate that agents are selected
      if (!request.selectedAgents || request.selectedAgents.length === 0) {
        throw this.createError(
          'VALIDATION_ERROR',
          'Agent selection is required. At least one agent must be selected for the expedition.'
        );
      }
      console.log(`[EXPEDITION-VALIDATION] Agent selection validated - ${request.selectedAgents.length} agents selected`);

      // Validate starship ownership
      await this.validateStarshipOwnership(request.starshipId, userId);
      console.log(`[EXPEDITION-VALIDATION] Starship ownership validated successfully`);

      // Validate starship status
      await this.validateStarshipStatus(request.starshipId);
      console.log(`[EXPEDITION-VALIDATION] Starship status validated successfully`);

      // Validate basic request fields
      this.validateRequestFields(request);
      console.log(`[EXPEDITION-VALIDATION] Request fields validated successfully`);

    } catch (error) {
      console.error('[EXPEDITION-VALIDATION] Creation request validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate starship ownership
   */
  async validateStarshipOwnership(starshipId: string, userId: string): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();

    try {
      const starship = await starshipRepo.findById(starshipId);

      if (!starship) {
        this.logger.warn(`Starship not found: ${starshipId} for user: ${userId}`, {
          service: 'expedition-validation-service',
          operation: 'validate_starship_ownership',
        });
        throw ErrorFactory.notFound('Starship', starshipId, {
          service: 'expedition-validation-service',
          operation: 'validate_starship_ownership',
        });
      }

      if (starship.ownerId !== userId) {
        this.logger.warn(`Access denied to starship: ${starshipId} for user: ${userId}`, {
          service: 'expedition-validation-service',
          operation: 'validate_starship_ownership',
        });
        throw ErrorFactory.authorization('Access denied to starship', {
          service: 'expedition-validation-service',
          operation: 'validate_starship_ownership',
          resource: 'starship',
          resourceId: starshipId,
        });
      }
    } catch (error: any) {
      if (error.code) {
        throw error; // Re-throw our custom errors
      }

      console.error(`[EXPEDITION-VALIDATION] Database error validating starship ownership:`, error);
      throw this.createError('STARSHIP_VALIDATION_FAILED', 'Failed to validate starship ownership');
    }
  }

  /**
   * Validate starship status
   */
  async validateStarshipStatus(starshipId: string): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (starship?.status === 'inactive') {
      throw this.createError('STARSHIP_MAINTENANCE', 'Starship is in maintenance mode');
    }
  }

  /**
   * Validate expedition access for a user
   */
  async validateExpeditionAccess(expedition: Expedition, userId: string): Promise<void> {
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(expedition.starshipId);

    if (!starship || starship.ownerId !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to expedition');
    }
  }

  /**
   * Validate if expedition can be modified
   */
  validateExpeditionModification(expedition: Expedition): void {
    if (['in-progress', 'completed', 'failed'].includes(expedition.status)) {
      throw this.createError(
        'EXPEDITION_CANNOT_MODIFY',
        'Cannot modify expedition in current status'
      );
    }
  }

  /**
   * Validate if expedition can be deleted
   */
  validateExpeditionDeletion(expedition: Expedition): void {
    if (['in-progress', 'planning'].includes(expedition.status)) {
      throw this.createError('EXPEDITION_CANNOT_DELETE', 'Cannot delete active expedition');
    }
  }

  /**
   * Validate expedition start conditions
   */
  validateExpeditionStart(expedition: Expedition): void {
    if (expedition.status !== 'draft') {
      throw this.createError(
        'INVALID_STATUS_TRANSITION',
        'Expedition must be in draft status to start'
      );
    }

    if (!expedition.assignedAgents || expedition.assignedAgents.length === 0) {
      throw this.createError(
        'NO_AGENTS_ASSIGNED',
        'Cannot start expedition without assigned agents'
      );
    }
  }

  /**
   * Validate expedition pause conditions
   */
  validateExpeditionPause(expedition: Expedition): void {
    if (!['planning', 'in-progress'].includes(expedition.status)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Can only pause active expeditions');
    }
  }

  /**
   * Validate expedition resume conditions
   */
  validateExpeditionResume(expedition: Expedition): void {
    // Resume logic would check for paused state when implemented
    if (!['planning', 'in-progress'].includes(expedition.status)) {
      throw this.createError('INVALID_STATUS_TRANSITION', 'Invalid expedition status for resume');
    }
  }

  /**
   * Validate expedition cancel conditions
   */
  validateExpeditionCancel(expedition: Expedition): void {
    if (['completed', 'failed', 'cancelled'].includes(expedition.status)) {
      throw this.createError(
        'INVALID_STATUS_TRANSITION',
        'Cannot cancel expedition in current status'
      );
    }
  }

  /**
   * Validate status transition
   */
  validateStatusTransition(currentStatus: ExpeditionStatus, newStatus: ExpeditionStatus): boolean {
    const validTransitions: Record<ExpeditionStatus, ExpeditionStatus[]> = {
      'draft': ['planning', 'cancelled'],
      'planning': ['in-progress', 'cancelled', 'failed'],
      'in-progress': ['completed', 'failed', 'cancelled'],
      'completed': [], // Terminal state
      'failed': ['draft'], // Can restart from failed
      'cancelled': ['draft'], // Can restart from cancelled
    };

    const allowedTransitions = validTransitions[currentStatus] || [];
    const isValidTransition = allowedTransitions.includes(newStatus);

    if (!isValidTransition) {
      throw this.createError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition from ${currentStatus} to ${newStatus}`
      );
    }

    return true;
  }

  /**
   * Validate expedition name constraints
   */
  validateExpeditionName(name: string): boolean {
    if (!name || name.trim().length === 0) {
      throw this.createError('INVALID_NAME', 'Expedition name is required');
    }

    if (name.length > 100) {
      throw this.createError('INVALID_NAME', 'Expedition name must be 100 characters or less');
    }

    // Check for prohibited characters or patterns
    const prohibitedPattern = /[<>\"'&]/;
    if (prohibitedPattern.test(name)) {
      throw this.createError('INVALID_NAME', 'Expedition name contains prohibited characters');
    }

    return true;
  }

  /**
   * Validate expedition mission constraints
   */
  validateExpeditionMission(mission: string): boolean {
    if (!mission || mission.trim().length === 0) {
      throw this.createError('INVALID_MISSION', 'Expedition mission is required');
    }

    if (mission.length > 2000) {
      throw this.createError('INVALID_MISSION', 'Expedition mission must be 2000 characters or less');
    }

    return true;
  }

  /**
   * Validate concurrent expedition limits for a starship
   */
  async validateConcurrentExpeditionLimits(starshipId: string): Promise<void> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const activeExpeditions = await expeditionRepo.findByStatus(starshipId, 'in-progress');

      // Example limit: max 5 concurrent expeditions per starship
      const MAX_CONCURRENT_EXPEDITIONS = 5;

      if (activeExpeditions.length >= MAX_CONCURRENT_EXPEDITIONS) {
        throw this.createError(
          'CONCURRENT_LIMIT_EXCEEDED',
          `Starship has reached the maximum limit of ${MAX_CONCURRENT_EXPEDITIONS} concurrent expeditions`
        );
      }
    } catch (error: any) {
      if (error.code) {
        throw error;
      }
      throw this.handleError(error, 'CONCURRENT_LIMIT_CHECK_FAILED');
    }
  }

  // Private helper methods

  /**
   * Validate basic request fields
   */
  private validateRequestFields(request: CreateExpeditionRequest): void {
    this.validateExpeditionName(request.name);
    this.validateExpeditionMission(request.mission);

    if (!request.starshipId) {
      throw this.createError('INVALID_REQUEST', 'Starship ID is required');
    }
  }

  private createError(code: string, message: string, expeditionId?: string): ExpeditionError {
    return ErrorFactory.expedition(code as any, message, expeditionId, {
      service: 'expedition-validation-service',
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
        service: 'expedition-validation-service',
        operation: 'error_handling',
        metadata: { originalError: error.toString() },
      }
    );
  }
}