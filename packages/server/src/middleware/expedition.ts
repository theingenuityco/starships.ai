/**
 * Expedition-specific middleware for authorization, validation, and error handling
 */

import { Request, Response, NextFunction } from 'express';
import { RepositoryFactory } from '@starships/models';

/**
 * Middleware to validate expedition ownership and access
 */
export const expeditionAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    if (!expeditionId) {
      res.status(400).json({
        success: false,
        error: 'Expedition ID is required',
        code: 'MISSING_EXPEDITION_ID'
      });
      return;
    }

    // Get expedition
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const expedition = await expeditionRepo.findById(expeditionId);

    if (!expedition) {
      res.status(404).json({
        success: false,
        error: 'Expedition not found',
        code: 'EXPEDITION_NOT_FOUND'
      });
      return;
    }

    // Validate starship ownership
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(expedition.starshipId);

    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to expedition',
        code: 'EXPEDITION_ACCESS_DENIED'
      });
      return;
    }

    // Attach expedition to request for use in route handlers
    req.expedition = expedition;
    req.starship = starship;

    next();
  } catch (error) {
    console.error('[EXPEDITION-MIDDLEWARE] Authorization failed:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during authorization',
      code: 'AUTHORIZATION_ERROR'
    });
  }
};

/**
 * Middleware to validate starship ownership for expedition creation
 */
export const starshipAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { starshipId } = req.params;
    const userId = req.user!.id;

    if (!starshipId) {
      res.status(400).json({
        success: false,
        error: 'Starship ID is required',
        code: 'MISSING_STARSHIP_ID'
      });
      return;
    }

    // Validate starship ownership
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(starshipId);

    if (!starship) {
      res.status(404).json({
        success: false,
        error: 'Starship not found',
        code: 'STARSHIP_NOT_FOUND'
      });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied to starship',
        code: 'STARSHIP_ACCESS_DENIED'
      });
      return;
    }

    // Check starship status
    if (starship.status === 'maintenance') {
      res.status(400).json({
        success: false,
        error: 'Starship is in maintenance mode',
        code: 'STARSHIP_MAINTENANCE'
      });
      return;
    }

    // Attach starship to request
    req.starship = starship;

    next();
  } catch (error) {
    console.error('[EXPEDITION-MIDDLEWARE] Starship authorization failed:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during starship authorization',
      code: 'STARSHIP_AUTHORIZATION_ERROR'
    });
  }
};

/**
 * Middleware to validate expedition creation request
 */
export const validateExpeditionCreation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { title, description, objective } = req.body;

  const errors: string[] = [];

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Title is required and must be a non-empty string');
  }

  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    errors.push('Description is required and must be a non-empty string');
  }

  if (!objective || typeof objective !== 'string' || objective.trim().length === 0) {
    errors.push('Objective is required and must be a non-empty string');
  }

  if (title && title.length > 200) {
    errors.push('Title must be 200 characters or less');
  }

  if (description && description.length > 1000) {
    errors.push('Description must be 1000 characters or less');
  }

  if (objective && objective.length > 2000) {
    errors.push('Objective must be 2000 characters or less');
  }

  // Validate optional fields
  if (req.body.priority && !['low', 'medium', 'high', 'urgent'].includes(req.body.priority)) {
    errors.push('Priority must be one of: low, medium, high, urgent');
  }

  if (req.body.estimatedDuration && (typeof req.body.estimatedDuration !== 'number' || req.body.estimatedDuration <= 0)) {
    errors.push('Estimated duration must be a positive number');
  }

  if (req.body.tags && (!Array.isArray(req.body.tags) || !req.body.tags.every((tag: any) => typeof tag === 'string'))) {
    errors.push('Tags must be an array of strings');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors
    });
    return;
  }

  next();
};

/**
 * Middleware to validate expedition update request
 */
export const validateExpeditionUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors: string[] = [];

  // Validate optional fields if provided
  if (req.body.title !== undefined) {
    if (typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
      errors.push('Title must be a non-empty string');
    } else if (req.body.title.length > 200) {
      errors.push('Title must be 200 characters or less');
    }
  }

  if (req.body.description !== undefined) {
    if (typeof req.body.description !== 'string' || req.body.description.trim().length === 0) {
      errors.push('Description must be a non-empty string');
    } else if (req.body.description.length > 1000) {
      errors.push('Description must be 1000 characters or less');
    }
  }

  if (req.body.objective !== undefined) {
    if (typeof req.body.objective !== 'string' || req.body.objective.trim().length === 0) {
      errors.push('Objective must be a non-empty string');
    } else if (req.body.objective.length > 2000) {
      errors.push('Objective must be 2000 characters or less');
    }
  }

  if (req.body.priority !== undefined && !['low', 'medium', 'high', 'urgent'].includes(req.body.priority)) {
    errors.push('Priority must be one of: low, medium, high, urgent');
  }

  if (req.body.status !== undefined && !['draft', 'planning', 'in-progress', 'review', 'completed', 'failed', 'cancelled'].includes(req.body.status)) {
    errors.push('Status must be a valid expedition status');
  }

  if (req.body.estimatedDuration !== undefined && (typeof req.body.estimatedDuration !== 'number' || req.body.estimatedDuration <= 0)) {
    errors.push('Estimated duration must be a positive number');
  }

  if (req.body.tags !== undefined && (!Array.isArray(req.body.tags) || !req.body.tags.every((tag: any) => typeof tag === 'string'))) {
    errors.push('Tags must be an array of strings');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors
    });
    return;
  }

  next();
};

/**
 * Middleware to validate task creation request
 */
export const validateTaskCreation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { title, description, requiredSkills, deliverable } = req.body;

  const errors: string[] = [];

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Title is required and must be a non-empty string');
  }

  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    errors.push('Description is required and must be a non-empty string');
  }

  if (!deliverable || typeof deliverable !== 'string' || deliverable.trim().length === 0) {
    errors.push('Deliverable is required and must be a non-empty string');
  }

  if (!requiredSkills || !Array.isArray(requiredSkills) || requiredSkills.length === 0) {
    errors.push('Required skills must be a non-empty array');
  } else if (!requiredSkills.every((skill: any) => typeof skill === 'string')) {
    errors.push('Required skills must be an array of strings');
  }

  // Validate optional fields
  if (req.body.priority && !['low', 'medium', 'high', 'critical'].includes(req.body.priority)) {
    errors.push('Priority must be one of: low, medium, high, critical');
  }

  if (req.body.dependencies && (!Array.isArray(req.body.dependencies) || !req.body.dependencies.every((dep: any) => typeof dep === 'string'))) {
    errors.push('Dependencies must be an array of strings');
  }

  if (req.body.estimatedEffort && (typeof req.body.estimatedEffort !== 'number' || req.body.estimatedEffort <= 0)) {
    errors.push('Estimated effort must be a positive number');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors
    });
    return;
  }

  next();
};

/**
 * Middleware to validate message sending request
 */
export const validateMessageSending = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { content, messageType } = req.body;

  const errors: string[] = [];

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    errors.push('Content is required and must be a non-empty string');
  }

  if (content && content.length > 5000) {
    errors.push('Content must be 5000 characters or less');
  }

  if (messageType && !['coordination', 'task-work', 'user-input', 'status-update', 'result', 'question', 'notification'].includes(messageType)) {
    errors.push('Message type must be a valid type');
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors
    });
    return;
  }

  next();
};

/**
 * Global error handler for expedition routes
 */
export const expeditionErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('[EXPEDITION-ERROR]', error);

  // Handle known expedition errors
  if (error.code) {
    const statusCode = getStatusCodeForError(error.code);
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
};

/**
 * Get appropriate HTTP status code for expedition error codes
 */
function getStatusCodeForError(code: string): number {
  switch (code) {
    case 'EXPEDITION_NOT_FOUND':
    case 'TASK_NOT_FOUND':
    case 'STARSHIP_NOT_FOUND':
      return 404;
    
    case 'EXPEDITION_ACCESS_DENIED':
    case 'STARSHIP_ACCESS_DENIED':
      return 403;
    
    case 'EXPEDITION_ALREADY_STARTED':
    case 'EXPEDITION_CANNOT_MODIFY':
    case 'EXPEDITION_CANNOT_DELETE':
    case 'INVALID_STATUS_TRANSITION':
    case 'STARSHIP_MAINTENANCE':
    case 'VALIDATION_ERROR':
      return 400;
    
    case 'AGENT_NOT_AVAILABLE':
    case 'AGENT_NOT_QUALIFIED':
      return 409;
    
    case 'RESOURCE_LIMIT_EXCEEDED':
      return 429;
    
    default:
      return 500;
  }
}