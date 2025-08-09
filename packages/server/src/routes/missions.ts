/**
 * Mission management routes
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { RepositoryFactory } from '@starships/models';
import type {
  Mission,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort,
  MissionListResponse
} from '@starships/protocol';
import {
  EnhancedValidationError as ValidationError,
  EnhancedNotFoundError as NotFoundError,
} from '@starships/models';
import { authMiddleware } from '../middleware/auth';

const router: Router = Router();

// Apply authentication to all mission routes
router.use(authMiddleware);

/**
 * Input validation helpers
 */
const validateUUID = (id: string, fieldName: string): void => {
  if (!id || typeof id !== 'string') {
    throw new ValidationError(`${fieldName} is required and must be a string`, fieldName);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError(`${fieldName} must be a valid UUID format`, fieldName);
  }
};

/**
 * GET /missions
 * Get all missions with optional filters and sorting
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const userId = req.user?.id;

    // Parse query parameters
    const filters: MissionFilters = {};
    const sort: MissionSort = {
      field: 'createdAt',
      direction: 'desc'
    };

    // Apply filters
    if (req.query.status) {
      const statusParam = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
      filters.status = statusParam.map(s => String(s)) as any;
    }

    if (req.query.starshipId) {
      validateUUID(String(req.query.starshipId), 'starshipId');
      filters.starshipId = String(req.query.starshipId);
    }

    if (req.query.createdBy) {
      validateUUID(String(req.query.createdBy), 'createdBy');
      filters.createdBy = String(req.query.createdBy);
    }

    // Apply sorting
    if (req.query.sortField) {
      const validSortFields = ['createdAt', 'updatedAt', 'status', 'name'];
      const sortField = String(req.query.sortField);
      if (validSortFields.includes(sortField)) {
        sort.field = sortField as any;
      }
    }

    if (req.query.sortDirection) {
      const sortDirection = String(req.query.sortDirection).toLowerCase();
      if (sortDirection === 'asc' || sortDirection === 'desc') {
        sort.direction = sortDirection;
      }
    }

    const result = await missionRepo.getAllMissions(filters, sort);
    res.json(result);

  } catch (error) {
    console.error('Error fetching missions:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /missions/:id
 * Get a specific mission by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const { id } = req.params;

    validateUUID(id, 'id');

    const mission = await missionRepo.getMissionById(id);
    res.json({ mission });

  } catch (error) {
    console.error('Error fetching mission:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /missions/starship/:starshipId
 * Get all missions for a specific starship
 */
router.get('/starship/:starshipId', async (req: Request, res: Response): Promise<void> => {
  try {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const { starshipId } = req.params;

    validateUUID(starshipId, 'starshipId');

    // Parse query parameters
    const filters: MissionFilters = {};
    const sort: MissionSort = {
      field: 'createdAt',
      direction: 'desc'
    };

    // Apply filters
    if (req.query.status) {
      const statusParam = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
      filters.status = statusParam.map(s => String(s)) as any;
    }

    if (req.query.createdBy) {
      validateUUID(String(req.query.createdBy), 'createdBy');
      filters.createdBy = String(req.query.createdBy);
    }

    // Apply sorting
    if (req.query.sortField) {
      const validSortFields = ['createdAt', 'updatedAt', 'status', 'name'];
      const sortField = String(req.query.sortField);
      if (validSortFields.includes(sortField)) {
        sort.field = sortField as any;
      }
    }

    if (req.query.sortDirection) {
      const sortDirection = String(req.query.sortDirection).toLowerCase();
      if (sortDirection === 'asc' || sortDirection === 'desc') {
        sort.direction = sortDirection;
      }
    }

    const result = await missionRepo.getMissionsByStarshipId(starshipId, filters, sort);
    res.json(result);

  } catch (error) {
    console.error('Error fetching starship missions:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /missions
 * Create a new mission
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const createRequest: CreateMissionRequest = req.body;

    // Basic validation
    if (!createRequest.starshipId) {
      throw new ValidationError('starshipId is required', 'starshipId');
    }
    
    if (!createRequest.name) {
      throw new ValidationError('name is required', 'name');
    }
    
    if (!createRequest.description) {
      throw new ValidationError('description is required', 'description');
    }

    validateUUID(createRequest.starshipId, 'starshipId');

    const mission = await missionRepo.createMission(createRequest, userId);
    res.status(201).json({ mission });

  } catch (error) {
    console.error('Error creating mission:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /missions/:id
 * Update an existing mission
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const { id } = req.params;
    const updates: UpdateMissionRequest = req.body;

    validateUUID(id, 'id');

    // Ensure at least one field is being updated
    if (!updates || Object.keys(updates).length === 0) {
      throw new ValidationError('At least one field must be provided for update', 'updates');
    }

    const mission = await missionRepo.updateMission(id, updates);
    res.json({ mission });

  } catch (error) {
    console.error('Error updating mission:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /missions/:id
 * Delete a mission
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const missionRepo = RepositoryFactory.getMissionRepository();
    const { id } = req.params;

    validateUUID(id, 'id');

    await missionRepo.deleteMission(id);
    res.status(204).send();

  } catch (error) {
    console.error('Error deleting mission:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;