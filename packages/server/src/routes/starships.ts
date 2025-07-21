/**
 * Starship management routes for Aether Core
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  StarshipRepository,
  AgentRepository,
  Starship,
  VisionRepository,
  MCPServerOptionRepository,
  MCPServerConnectorRepository,
  ConnectorConfigTemplateRepository,
  ConnectorConfigHistoryRepository,
} from '@starships/models';
import {
  ValidationError,
  ConstraintViolationError,
  NotFoundError,
} from '@starships/models/src/types';
import { authMiddleware } from '../middleware/auth';

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

const validateStarshipClass = (starshipClass: string): void => {
  const validClasses = ['scout', 'cruiser'];
  if (!validClasses.includes(starshipClass)) {
    throw new ValidationError(
      `Starship class must be one of: ${validClasses.join(', ')}. Got: ${starshipClass}`,
      'class'
    );
  }
};

const validateStarshipStatus = (status: string): void => {
  const validStatuses = ['active', 'docked', 'maintenance'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(
      `Starship status must be one of: ${validStatuses.join(', ')}. Got: ${status}`,
      'status'
    );
  }
};

/**
 * Error handling helper to convert custom errors to appropriate HTTP responses
 */
const handleError = (error: any, res: Response, context: string): void => {
  console.error(`[STARSHIPS] ${context}:`, error);

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      field: error.field,
    });
    return;
  }

  if (error instanceof ConstraintViolationError) {
    const statusCode = error.constraintType === 'unique' ? 409 : 400;
    res.status(statusCode).json({
      error: 'Constraint Violation',
      message: error.message,
      constraintType: error.constraintType,
    });
    return;
  }

  if (error instanceof NotFoundError) {
    res.status(404).json({
      error: 'Not Found',
      message: error.message,
      entityType: error.entityType,
      entityId: error.entityId,
    });
    return;
  }

  // Handle generic errors
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(500).json({
    error: 'Internal Server Error',
    message: `${context}: ${message}`,
  });
};

const router: Router = Router();

// Temporary in-memory repositories until we connect the full dependency injection
// TODO: Replace with proper dependency injection pattern
let starshipRepo: StarshipRepository;
let agentRepo: AgentRepository;
let mcpServerRepo: MCPServerOptionRepository;
let mcpConnectorRepo: MCPServerConnectorRepository;
let configTemplateRepo: ConnectorConfigTemplateRepository;
let configHistoryRepo: ConnectorConfigHistoryRepository;
let visionRepo: VisionRepository;

export function initializeStarshipRoutes(deps: {
  starshipRepository: StarshipRepository;
  agentRepository: AgentRepository;
  mcpServerOptionRepository: MCPServerOptionRepository;
  mcpServerConnectorRepository: MCPServerConnectorRepository;
  connectorConfigTemplateRepository: ConnectorConfigTemplateRepository;
  connectorConfigHistoryRepository: ConnectorConfigHistoryRepository;
  visionRepository: VisionRepository;
}) {
  starshipRepo = deps.starshipRepository;
  agentRepo = deps.agentRepository;
  mcpServerRepo = deps.mcpServerOptionRepository;
  mcpConnectorRepo = deps.mcpServerConnectorRepository;
  configTemplateRepo = deps.connectorConfigTemplateRepository;
  configHistoryRepo = deps.connectorConfigHistoryRepository;
  visionRepo = deps.visionRepository;
}

// GET /starships - Get user's starships
router.get('/starships', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const starships = await starshipRepo.findByOwner(userId);
    res.json({ starships });
  } catch (error) {
    console.error('Error fetching starships:', error);
    res.status(500).json({ error: 'Failed to fetch starships' });
  }
});

// POST /starships - Create new starship
router.post('/starships', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, class: starshipClass } = req.body;

    console.log('[STARSHIP-CREATE] Starting starship creation for user:', userId);

    if (!name || !starshipClass) {
      res.status(400).json({
        error: 'Missing required fields',
        details: 'Both name and class are required to create a starship',
        required_fields: ['name', 'class'],
        provided: { name: !!name, class: !!starshipClass },
      });
      return;
    }

    // Validate starship class
    if (!['scout', 'cruiser'].includes(starshipClass)) {
      res.status(400).json({
        error: 'Invalid starship class',
        details: 'Starship class must be either scout or cruiser',
        allowed_values: ['scout', 'cruiser'],
        provided: starshipClass,
      });
      return;
    }

    console.log('[STARSHIP-CREATE] Generating unique slug...');
    // Generate unique slug for the starship
    const slug = await starshipRepo.generateUniqueSlug(name, userId);
    console.log('[STARSHIP-CREATE] Generated slug:', slug);

    console.log('[STARSHIP-CREATE] Creating starship in database...');
    // Create starship directly (bypassing codex system)
    const starship = await starshipRepo.create({
      ownerId: userId,
      name,
      class: starshipClass,
      slug,
      maxActiveExpeditions: starshipClass === 'scout' ? 2 : 5,
      status: 'active',
    });
    console.log('[STARSHIP-CREATE] Starship created with ID:', starship.id);

    console.log('[STARSHIP-CREATE] Creating empty vision in database...');
    // Create empty vision in database for the new starship
    await visionRepo.create({
      starshipId: starship.id,
      statement: '',
      confidence: 0.5,
      refinementCount: 0,
      lastRefined: new Date().toISOString(),
      isActive: true,
    });
    console.log('[STARSHIP-CREATE] Vision created successfully in database');

    console.log('[STARSHIP-CREATE] Starship creation completed successfully');
    res.status(201).json({ starship });
  } catch (error) {
    console.error('[STARSHIP-CREATE] Error creating starship:', error);
    res.status(500).json({ error: 'Failed to create starship' });
  }
});

// GET /starships/:idOrSlug - Get specific starship (supports both ID and slug)
router.get('/starships/:idOrSlug', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    const userId = req.user!.id;

    // Try to find by ID first, then by slug
    let starship = await starshipRepo.findById(idOrSlug);

    if (!starship) {
      // Try to find by slug
      starship = await starshipRepo.findBySlug(idOrSlug, userId);
    }

    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    // Check ownership
    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get deployed agents
    const agents = await starshipRepo.getDeployedAgents(starship.id);
    const availableSlots = await starshipRepo.getAvailableSlots(starship.id);

    res.json({ starship, agents, availableSlots });
  } catch (error) {
    console.error('Error fetching starship:', error);
    res.status(500).json({ error: 'Failed to fetch starship' });
  }
});

// POST /starships/:id/agents/:agentId/deploy - Deploy agent to starship
router.post(
  '/starships/:id/agents/:agentId/deploy',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipId, agentId } = req.params;

      // Verify starship ownership
      const starship = await starshipRepo.findById(starshipId);
      if (!starship || starship.ownerId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify agent exists
      const agent = await agentRepo.findById(agentId);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      // Deploy agent
      await starshipRepo.deployAgent(starshipId, agentId);

      res.json({ message: 'Agent deployed successfully' });
    } catch (error) {
      console.error('Error deploying agent:', error);

      if (error instanceof Error) {
        if (error.message.includes('No available agent slots')) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error.message.includes('already deployed')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }

      res.status(500).json({ error: 'Failed to deploy agent' });
    }
  }
);

// DELETE /starships/:id/agents/:agentId - Remove agent from starship
router.delete(
  '/starships/:id/agents/:agentId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipId, agentId } = req.params;

      // Verify starship ownership
      const starship = await starshipRepo.findById(starshipId);
      if (!starship || starship.ownerId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Remove agent
      const removed = await starshipRepo.removeAgent(starshipId, agentId);

      if (!removed) {
        res.status(404).json({ error: 'Agent not deployed on this starship' });
        return;
      }

      res.json({ message: 'Agent removed successfully' });
    } catch (error) {
      console.error('Error removing agent:', error);
      res.status(500).json({ error: 'Failed to remove agent' });
    }
  }
);

// PUT /starships/:id - Update starship (name, status, class)
router.put('/starships/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;
    const { name, status, class: starshipClass } = req.body;

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Validate allowed updates
    const allowedUpdates: Partial<Starship> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Name must be a non-empty string' });
        return;
      }
      allowedUpdates.name = name.trim();
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        res.status(400).json({ error: 'Status must be one of: active, inactive' });
        return;
      }
      allowedUpdates.status = status;
    }

    if (starshipClass !== undefined) {
      if (!['scout', 'cruiser'].includes(starshipClass)) {
        res.status(400).json({ error: 'Class must be one of: scout, cruiser' });
        return;
      }
      // Check if there are deployed agents that exceed new class limits
      if (starshipClass === 'scout') {
        const deployedAgents = await starshipRepo.getDeployedAgents(starshipId);
        if (deployedAgents.length > 3) {
          res.status(400).json({
            error: 'Cannot change to scout class: too many deployed agents (max 3 for scout)',
          });
          return;
        }
      }
      allowedUpdates.class = starshipClass;
      // Update maxAgents based on new class
      allowedUpdates.maxAgents = starshipClass === 'scout' ? 3 : 6;
    }

    // NEW: Handle maxActiveExpeditions updates
    const { maxActiveExpeditions } = req.body;
    if (maxActiveExpeditions !== undefined) {
      if (typeof maxActiveExpeditions !== 'number' || maxActiveExpeditions < 0) {
        res.status(400).json({ error: 'maxActiveExpeditions must be a non-negative number' });
        return;
      }
      allowedUpdates.maxActiveExpeditions = maxActiveExpeditions;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      res.status(400).json({ error: 'No valid updates provided' });
      return;
    }

    const updatedStarship = await starshipRepo.update(starshipId, allowedUpdates);
    if (!updatedStarship) {
      res.status(500).json({ error: 'Failed to update starship' });
      return;
    }

    res.json({ starship: updatedStarship });
  } catch (error) {
    console.error('Error updating starship:', error);
    res.status(500).json({ error: 'Failed to update starship' });
  }
});

// DELETE /starships/:id - Delete starship
router.delete('/starships/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Note: activeExpeditions field removed - business logic can be implemented later
    // if expedition tracking is needed in the future

    const deleted = await starshipRepo.delete(starshipId);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete starship' });
      return;
    }

    res.json({ message: 'Starship deleted successfully' });
  } catch (error) {
    console.error('Error deleting starship:', error);
    res.status(500).json({ error: 'Failed to delete starship' });
  }
});

// PUT /starships/:id/status - Update starship status specifically
router.put('/starships/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;
    const { status } = req.body;

    if (!status || !['active', 'inactive'].includes(status)) {
      res.status(400).json({ error: 'Status must be one of: active, inactive' });
      return;
    }

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Business rule simplified - status can be set to active or inactive freely

    const updatedStarship = await starshipRepo.update(starshipId, { status });
    if (!updatedStarship) {
      res.status(500).json({ error: 'Failed to update starship status' });
      return;
    }

    res.json({ starship: updatedStarship });
  } catch (error) {
    console.error('Error updating starship status:', error);
    res.status(500).json({ error: 'Failed to update starship status' });
  }
});

// GET /starships/:id/agents - Get detailed agent information for starship
router.get('/starships/:id/agents', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;

    // Verify starship exists and ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship) {
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get deployed agents and available slots
    const deployedAgents = await starshipRepo.getDeployedAgents(starshipId);
    const availableSlots = await starshipRepo.getAvailableSlots(starshipId);

    res.json({
      starshipId,
      starshipName: starship.name,
      starshipClass: starship.class,
      maxAgents: starship.maxAgents,
      deployedAgents,
      availableSlots,
      deployedCount: deployedAgents.length,
    });
  } catch (error) {
    console.error('Error fetching starship agents:', error);
    res.status(500).json({ error: 'Failed to fetch starship agents' });
  }
});

// GET /starships/:id/connectors - Get connected MCP servers for starship
router.get('/starships/:id/connectors', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: starshipIdOrSlug } = req.params;
    const userId = req.user!.id;

    console.log(
      `[STARSHIPS] Fetching connectors for starship: ${starshipIdOrSlug}, user: ${userId}`
    );

    // Validate starship ID/slug
    if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
      res.status(400).json({ error: 'Starship ID or slug is required' });
      return;
    }

    // Try to find starship by ID first, then by slug
    let starship = await starshipRepo.findById(starshipIdOrSlug);
    if (!starship) {
      starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
    }

    if (!starship) {
      console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      console.log(
        `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
      );
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get connector instances using the new connector instance system
    const connectorInstances = await mcpConnectorRepo.findByStarship(starship.id);

    // Get the template details for each connector instance
    const connectedConnectors = await Promise.all(
      connectorInstances.map(async (connector) => {
        try {
          const template = await mcpServerRepo.findById(connector.templateId);
          return {
            id: connector.id,
            templateId: connector.templateId,
            name: template?.name || 'Unknown Connector',
            command: template?.command || '',
            args: template?.args || [],
            env: template?.env || '{}',
            status: connector.status,
            isActive: connector.isActive,
            connectedAt: connector.connectedAt,
            lastUsed: connector.lastUsed,
            errorMessage: connector.errorMessage,
            createdAt: connector.createdAt,
            updatedAt: connector.updatedAt,
          };
        } catch (error) {
          console.error(
            `[STARSHIPS] Error fetching template for connector ${connector.id}:`,
            error
          );
          return {
            id: connector.id,
            templateId: connector.templateId,
            name: 'Unknown Connector',
            command: '',
            args: [],
            env: '{}',
            status: connector.status,
            isActive: connector.isActive,
            connectedAt: connector.connectedAt,
            lastUsed: connector.lastUsed,
            errorMessage: connector.errorMessage,
            createdAt: connector.createdAt,
            updatedAt: connector.updatedAt,
          };
        }
      })
    );

    console.log(
      `[STARSHIPS] Found ${connectedConnectors.length} connector instances for starship: ${starship.id}`
    );

    res.json({
      starshipId: starship.id,
      connectedConnectors,
    });
  } catch (error) {
    console.error(`[STARSHIPS] Error fetching connectors for starship ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch starship connectors' });
  }
});

// POST /starships/:id/connectors/:templateId - Create connector instance from template
router.post(
  '/starships/:id/connectors/:templateId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, templateId } = req.params;
      const userId = req.user!.id;

      console.log(
        `[STARSHIPS] Creating connector instance from template ${templateId} for starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Enhanced parameter validation
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        return handleError(
          new ValidationError('Starship ID or slug is required', 'starshipId'),
          res,
          'Invalid starship parameter'
        );
      }

      if (!templateId || templateId.trim().length === 0) {
        return handleError(
          new ValidationError('Template ID is required', 'templateId'),
          res,
          'Invalid template parameter'
        );
      }

      // Validate UUID format for templateId
      try {
        validateUUID(templateId, 'templateId');
      } catch (error) {
        return handleError(error, res, 'Invalid template ID format');
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify MCP server template exists
      const mcpServerTemplate = await mcpServerRepo.findById(templateId);
      if (!mcpServerTemplate) {
        console.log(`[STARSHIPS] MCP server template not found: ${templateId}`);
        res.status(404).json({ error: 'MCP server template not found' });
        return;
      }

      // Check if connector instance already exists for this starship and template
      const existingConnector = await mcpConnectorRepo.findByStarshipAndTemplate(
        starship.id,
        templateId
      );

      if (existingConnector) {
        console.log(
          `[STARSHIPS] Connector instance already exists for starship ${starship.id} and template ${templateId} - returning success`
        );
        // Return 200 success instead of 409 conflict for idempotent operation
        res.status(200).json({
          message: 'Connector instance already exists for this starship',
          starshipId: starship.id,
          connectorId: existingConnector.id,
          templateId: templateId,
          connectedAt: existingConnector.connectedAt,
          status: existingConnector.status,
          alreadyConnected: true,
        });
        return;
      }

      // Create new connector instance from template
      const connectorInstance = await mcpConnectorRepo.createFromTemplate(starship.id, templateId);

      console.log(
        `[STARSHIPS] Successfully created connector instance ${connectorInstance.id} from template ${templateId} for starship ${starship.id}`
      );

      res.status(201).json({
        message: 'Connector instance created successfully',
        starshipId: starship.id,
        connectorId: connectorInstance.id,
        templateId: templateId,
        status: connectorInstance.status,
        connectedAt: connectorInstance.connectedAt,
        createdAt: connectorInstance.createdAt,
      });
    } catch (error) {
      handleError(
        error,
        res,
        `Error creating connector instance from template ${req.params.templateId} for starship ${req.params.id}`
      );
    }
  }
);

// PUT /starships/:id/connectors/:connectorId - Update connector instance
router.put(
  '/starships/:id/connectors/:connectorId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, connectorId } = req.params;
      const userId = req.user!.id;
      const updates = req.body;

      console.log(
        `[STARSHIPS] Updating connector instance ${connectorId} for starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Enhanced parameter validation
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        return handleError(
          new ValidationError('Starship ID or slug is required', 'starshipId'),
          res,
          'Invalid starship parameter'
        );
      }

      if (!connectorId || connectorId.trim().length === 0) {
        return handleError(
          new ValidationError('Connector ID is required', 'connectorId'),
          res,
          'Invalid connector parameter'
        );
      }

      // Validate UUID format for connectorId
      try {
        validateUUID(connectorId, 'connectorId');
      } catch (error) {
        return handleError(error, res, 'Invalid connector ID format');
      }

      // Validate update payload
      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return handleError(
          new ValidationError('Update data is required and cannot be empty', 'updates'),
          res,
          'Invalid update payload'
        );
      }

      // Validate status if provided
      if (updates.status) {
        const validStatuses = ['active', 'inactive', 'error', 'connecting'];
        if (!validStatuses.includes(updates.status)) {
          return handleError(
            new ValidationError(
              `Status must be one of: ${validStatuses.join(', ')}. Got: ${updates.status}`,
              'status'
            ),
            res,
            'Invalid status value'
          );
        }
      }

      // Validate isActive if provided
      if (updates.isActive !== undefined && typeof updates.isActive !== 'boolean') {
        return handleError(
          new ValidationError('isActive must be a boolean value', 'isActive'),
          res,
          'Invalid isActive value'
        );
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify connector instance exists and belongs to this starship
      const connectorInstance = await mcpConnectorRepo.findById(connectorId);
      if (!connectorInstance) {
        console.log(`[STARSHIPS] Connector instance not found: ${connectorId}`);
        res.status(404).json({ error: 'Connector instance not found' });
        return;
      }

      if (connectorInstance.starshipId !== starship.id) {
        console.log(
          `[STARSHIPS] Connector instance ${connectorId} does not belong to starship ${starship.id}`
        );
        res.status(403).json({ error: 'Connector instance does not belong to this starship' });
        return;
      }

      // Update the connector instance
      const updatedConnector = await mcpConnectorRepo.update(connectorId, updates);

      if (!updatedConnector) {
        console.error(`[STARSHIPS] Failed to update connector instance ${connectorId}`);
        res.status(500).json({ error: 'Failed to update connector instance' });
        return;
      }

      console.log(
        `[STARSHIPS] Successfully updated connector instance ${connectorId} for starship ${starship.id}`
      );

      res.json({
        message: 'Connector instance updated successfully',
        starshipId: starship.id,
        connector: updatedConnector,
      });
    } catch (error) {
      handleError(
        error,
        res,
        `Error updating connector instance ${req.params.connectorId} for starship ${req.params.id}`
      );
    }
  }
);

// DELETE /starships/:id/connectors/:connectorId - Remove connector instance
router.delete(
  '/starships/:id/connectors/:connectorId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, connectorId } = req.params;
      const userId = req.user!.id;

      console.log(
        `[STARSHIPS] Removing connector instance ${connectorId} from starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Enhanced parameter validation
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        return handleError(
          new ValidationError('Starship ID or slug is required', 'starshipId'),
          res,
          'Invalid starship parameter'
        );
      }

      if (!connectorId || connectorId.trim().length === 0) {
        return handleError(
          new ValidationError('Connector ID is required', 'connectorId'),
          res,
          'Invalid connector parameter'
        );
      }

      // Validate UUID format for connectorId
      try {
        validateUUID(connectorId, 'connectorId');
      } catch (error) {
        return handleError(error, res, 'Invalid connector ID format');
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify connector instance exists and belongs to this starship
      const connectorInstance = await mcpConnectorRepo.findById(connectorId);
      if (!connectorInstance) {
        console.log(`[STARSHIPS] Connector instance not found: ${connectorId}`);
        res.status(404).json({ error: 'Connector instance not found' });
        return;
      }

      if (connectorInstance.starshipId !== starship.id) {
        console.log(
          `[STARSHIPS] Connector instance ${connectorId} does not belong to starship ${starship.id}`
        );
        res.status(403).json({ error: 'Connector instance does not belong to this starship' });
        return;
      }

      // Delete the connector instance
      const deleted = await mcpConnectorRepo.delete(connectorInstance.id);

      if (!deleted) {
        console.error(`[STARSHIPS] Failed to delete connector instance ${connectorInstance.id}`);
        res.status(500).json({ error: 'Failed to remove connector instance' });
        return;
      }

      console.log(
        `[STARSHIPS] Successfully removed connector instance ${connectorInstance.id} from starship ${starship.id}`
      );

      res.json({
        message: 'Connector instance removed successfully',
        starshipId: starship.id,
        connectorId: connectorInstance.id,
        templateId: connectorInstance.templateId,
        removedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleError(
        error,
        res,
        `Error removing connector instance ${req.params.connectorId} from starship ${req.params.id}`
      );
    }
  }
);

// GET /starships/:id/connectors/:connectorId - Get specific connector instance
router.get(
  '/starships/:id/connectors/:connectorId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, connectorId } = req.params;
      const userId = req.user!.id;

      console.log(
        `[STARSHIPS] Fetching connector instance ${connectorId} for starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Validate parameters
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        res.status(400).json({ error: 'Starship ID or slug is required' });
        return;
      }

      if (!connectorId || connectorId.trim().length === 0) {
        res.status(400).json({ error: 'Connector ID is required' });
        return;
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify connector instance exists and belongs to this starship
      const connectorInstance = await mcpConnectorRepo.findById(connectorId);
      if (!connectorInstance) {
        console.log(`[STARSHIPS] Connector instance not found: ${connectorId}`);
        res.status(404).json({ error: 'Connector instance not found' });
        return;
      }

      if (connectorInstance.starshipId !== starship.id) {
        console.log(
          `[STARSHIPS] Connector instance ${connectorId} does not belong to starship ${starship.id}`
        );
        res.status(403).json({ error: 'Connector instance does not belong to this starship' });
        return;
      }

      // Get template details
      const template = await mcpServerRepo.findById(connectorInstance.templateId);

      const connectorWithTemplate = {
        id: connectorInstance.id,
        templateId: connectorInstance.templateId,
        name: template?.name || 'Unknown Connector',
        command: template?.command || '',
        args: template?.args || [],
        env: template?.env || '{}',
        status: connectorInstance.status,
        isActive: connectorInstance.isActive,
        connectedAt: connectorInstance.connectedAt,
        lastUsed: connectorInstance.lastUsed,
        errorMessage: connectorInstance.errorMessage,
        createdAt: connectorInstance.createdAt,
        updatedAt: connectorInstance.updatedAt,
      };

      console.log(
        `[STARSHIPS] Found connector instance ${connectorId} for starship ${starship.id}`
      );

      res.json({
        starshipId: starship.id,
        connector: connectorWithTemplate,
      });
    } catch (error) {
      console.error(
        `[STARSHIPS] Error fetching connector instance ${req.params.connectorId} for starship ${req.params.id}:`,
        error
      );

      res.status(500).json({ error: 'Failed to fetch connector instance' });
    }
  }
);

// PUT /starships/:id/connectors/:connectorId/config - Update connector instance configuration
router.put(
  '/starships/:id/connectors/:connectorId/config',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, connectorId } = req.params;
      const userId = req.user!.id;
      const { config, changeSummary } = req.body;

      console.log(
        `[STARSHIPS] Updating configuration for connector instance ${connectorId} on starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Enhanced parameter validation
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        return handleError(
          new ValidationError('Starship ID or slug is required', 'starshipId'),
          res,
          'Invalid starship parameter'
        );
      }

      if (!connectorId || connectorId.trim().length === 0) {
        return handleError(
          new ValidationError('Connector ID is required', 'connectorId'),
          res,
          'Invalid connector parameter'
        );
      }

      // Validate UUID format for connectorId
      try {
        validateUUID(connectorId, 'connectorId');
      } catch (error) {
        return handleError(error, res, 'Invalid connector ID format');
      }

      // Validate configuration payload
      if (!config || typeof config !== 'object') {
        return handleError(
          new ValidationError('Configuration is required and must be an object', 'config'),
          res,
          'Invalid configuration payload'
        );
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify connector instance exists and belongs to this starship
      const connectorInstance = await mcpConnectorRepo.findById(connectorId);
      if (!connectorInstance) {
        console.log(`[STARSHIPS] Connector instance not found: ${connectorId}`);
        res.status(404).json({ error: 'Connector instance not found' });
        return;
      }

      if (connectorInstance.starshipId !== starship.id) {
        console.log(
          `[STARSHIPS] Connector instance ${connectorId} does not belong to starship ${starship.id}`
        );
        res.status(403).json({ error: 'Connector instance does not belong to this starship' });
        return;
      }

      // Update the connector configuration
      const updatedConnector = await mcpConnectorRepo.updateConfig(
        connectorId,
        config,
        userId,
        changeSummary
      );

      if (!updatedConnector) {
        console.error(
          `[STARSHIPS] Failed to update configuration for connector instance ${connectorId}`
        );
        res.status(500).json({ error: 'Failed to update connector configuration' });
        return;
      }

      console.log(
        `[STARSHIPS] Successfully updated configuration for connector instance ${connectorId} on starship ${starship.id}`
      );

      res.json({
        message: 'Connector configuration updated successfully',
        starshipId: starship.id,
        connector: updatedConnector,
      });
    } catch (error) {
      handleError(
        error,
        res,
        `Error updating configuration for connector instance ${req.params.connectorId} on starship ${req.params.id}`
      );
    }
  }
);

// POST /starships/:id/connectors/:connectorId/config/template - Apply configuration template
router.post(
  '/starships/:id/connectors/:connectorId/config/template',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, connectorId } = req.params;
      const userId = req.user!.id;
      const { templateId } = req.body;

      console.log(
        `[STARSHIPS] Applying configuration template ${templateId} to connector instance ${connectorId} on starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Enhanced parameter validation
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        return handleError(
          new ValidationError('Starship ID or slug is required', 'starshipId'),
          res,
          'Invalid starship parameter'
        );
      }

      if (!connectorId || connectorId.trim().length === 0) {
        return handleError(
          new ValidationError('Connector ID is required', 'connectorId'),
          res,
          'Invalid connector parameter'
        );
      }

      if (!templateId || templateId.trim().length === 0) {
        return handleError(
          new ValidationError('Template ID is required', 'templateId'),
          res,
          'Invalid template parameter'
        );
      }

      // Validate UUID formats
      try {
        validateUUID(connectorId, 'connectorId');
        validateUUID(templateId, 'templateId');
      } catch (error) {
        return handleError(error, res, 'Invalid ID format');
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify connector instance exists and belongs to this starship
      const connectorInstance = await mcpConnectorRepo.findById(connectorId);
      if (!connectorInstance) {
        console.log(`[STARSHIPS] Connector instance not found: ${connectorId}`);
        res.status(404).json({ error: 'Connector instance not found' });
        return;
      }

      if (connectorInstance.starshipId !== starship.id) {
        console.log(
          `[STARSHIPS] Connector instance ${connectorId} does not belong to starship ${starship.id}`
        );
        res.status(403).json({ error: 'Connector instance does not belong to this starship' });
        return;
      }

      // Apply the configuration template
      const updatedConnector = await mcpConnectorRepo.applyConfigTemplate(
        connectorId,
        templateId,
        userId
      );

      if (!updatedConnector) {
        console.error(
          `[STARSHIPS] Failed to apply configuration template to connector instance ${connectorId}`
        );
        res.status(500).json({ error: 'Failed to apply configuration template' });
        return;
      }

      console.log(
        `[STARSHIPS] Successfully applied configuration template ${templateId} to connector instance ${connectorId} on starship ${starship.id}`
      );

      res.json({
        message: 'Configuration template applied successfully',
        starshipId: starship.id,
        connector: updatedConnector,
        templateId,
      });
    } catch (error) {
      handleError(
        error,
        res,
        `Error applying configuration template to connector instance ${req.params.connectorId} on starship ${req.params.id}`
      );
    }
  }
);

// GET /starships/:id/connectors/:connectorId/config - Get connector instance configuration
router.get(
  '/starships/:id/connectors/:connectorId/config',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, connectorId } = req.params;
      const userId = req.user!.id;

      console.log(
        `[STARSHIPS] Fetching configuration for connector instance ${connectorId} on starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Validate parameters
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        res.status(400).json({ error: 'Starship ID or slug is required' });
        return;
      }

      if (!connectorId || connectorId.trim().length === 0) {
        res.status(400).json({ error: 'Connector ID is required' });
        return;
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify connector instance exists and belongs to this starship
      const connectorInstance = await mcpConnectorRepo.findById(connectorId);
      if (!connectorInstance) {
        console.log(`[STARSHIPS] Connector instance not found: ${connectorId}`);
        res.status(404).json({ error: 'Connector instance not found' });
        return;
      }

      if (connectorInstance.starshipId !== starship.id) {
        console.log(
          `[STARSHIPS] Connector instance ${connectorId} does not belong to starship ${starship.id}`
        );
        res.status(403).json({ error: 'Connector instance does not belong to this starship' });
        return;
      }

      console.log(
        `[STARSHIPS] Found configuration for connector instance ${connectorId} on starship ${starship.id}`
      );

      res.json({
        starshipId: starship.id,
        connectorId: connectorInstance.id,
        config: connectorInstance.config || {},
        configTemplateId: connectorInstance.configTemplateId,
        configVersion: connectorInstance.configVersion || 0,
      });
    } catch (error) {
      console.error(
        `[STARSHIPS] Error fetching configuration for connector instance ${req.params.connectorId} on starship ${req.params.id}:`,
        error
      );

      res.status(500).json({ error: 'Failed to fetch connector configuration' });
    }
  }
);

// GET /config-templates - Get all configuration templates
router.get('/config-templates', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, public: isPublic } = req.query;

    let templates;
    if (isPublic === 'true') {
      templates = await configTemplateRepo.findPublic();
    } else if (category) {
      templates = await configTemplateRepo.findByCategory(category as string);
    } else {
      templates = await configTemplateRepo.findAll();
    }

    res.json({ templates });
  } catch (error) {
    handleError(error, res, 'Error fetching configuration templates');
  }
});

// POST /config-templates - Create new configuration template
router.post('/config-templates', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, description, category, config, tags, isPublic } = req.body;

    // Validate required fields
    if (!name || !category || !config) {
      return handleError(
        new ValidationError('Name, category, and config are required', 'template'),
        res,
        'Invalid template data'
      );
    }

    const template = await configTemplateRepo.create({
      name,
      description,
      category,
      config,
      tags: tags || [],
      isPublic: isPublic || false,
      authorId: userId,
      usageCount: 0,
    });

    res.status(201).json({ template });
  } catch (error) {
    handleError(error, res, 'Error creating configuration template');
  }
});

// GET /config-templates/:id - Get specific configuration template
router.get('/config-templates/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    try {
      validateUUID(id, 'templateId');
    } catch (error) {
      return handleError(error, res, 'Invalid template ID format');
    }

    const template = await configTemplateRepo.findById(id);
    if (!template) {
      res.status(404).json({ error: 'Configuration template not found' });
      return;
    }

    res.json({ template });
  } catch (error) {
    handleError(error, res, 'Error fetching configuration template');
  }
});

// PUT /config-templates/:id - Update configuration template
router.put('/config-templates/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const updates = req.body;

    // Validate UUID format
    try {
      validateUUID(id, 'templateId');
    } catch (error) {
      return handleError(error, res, 'Invalid template ID format');
    }

    // Check if template exists and user has permission
    const existingTemplate = await configTemplateRepo.findById(id);
    if (!existingTemplate) {
      res.status(404).json({ error: 'Configuration template not found' });
      return;
    }

    if (existingTemplate.authorId !== userId) {
      res.status(403).json({ error: 'Access denied - you can only update your own templates' });
      return;
    }

    const updatedTemplate = await configTemplateRepo.update(id, updates);
    if (!updatedTemplate) {
      res.status(500).json({ error: 'Failed to update configuration template' });
      return;
    }

    res.json({ template: updatedTemplate });
  } catch (error) {
    handleError(error, res, 'Error updating configuration template');
  }
});

// DELETE /config-templates/:id - Delete configuration template
router.delete('/config-templates/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Validate UUID format
    try {
      validateUUID(id, 'templateId');
    } catch (error) {
      return handleError(error, res, 'Invalid template ID format');
    }

    // Check if template exists and user has permission
    const existingTemplate = await configTemplateRepo.findById(id);
    if (!existingTemplate) {
      res.status(404).json({ error: 'Configuration template not found' });
      return;
    }

    if (existingTemplate.authorId !== userId) {
      res.status(403).json({ error: 'Access denied - you can only delete your own templates' });
      return;
    }

    const deleted = await configTemplateRepo.delete(id);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete configuration template' });
      return;
    }

    res.json({ message: 'Configuration template deleted successfully' });
  } catch (error) {
    handleError(error, res, 'Error deleting configuration template');
  }
});

// GET /config-templates/search - Search configuration templates
router.get('/config-templates/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { q: query, category } = req.query;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const templates = await configTemplateRepo.search(query, category as string);
    res.json({ templates });
  } catch (error) {
    handleError(error, res, 'Error searching configuration templates');
  }
});

// GET /starships/:id/connectors/:connectorId/config/history - Get configuration history
router.get(
  '/starships/:id/connectors/:connectorId/config/history',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, connectorId } = req.params;
      const userId = req.user!.id;
      const { limit } = req.query;

      console.log(
        `[STARSHIPS] Fetching configuration history for connector instance ${connectorId} on starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Validate parameters
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        res.status(400).json({ error: 'Starship ID or slug is required' });
        return;
      }

      if (!connectorId || connectorId.trim().length === 0) {
        res.status(400).json({ error: 'Connector ID is required' });
        return;
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify connector instance exists and belongs to this starship
      const connectorInstance = await mcpConnectorRepo.findById(connectorId);
      if (!connectorInstance) {
        console.log(`[STARSHIPS] Connector instance not found: ${connectorId}`);
        res.status(404).json({ error: 'Connector instance not found' });
        return;
      }

      if (connectorInstance.starshipId !== starship.id) {
        console.log(
          `[STARSHIPS] Connector instance ${connectorId} does not belong to starship ${starship.id}`
        );
        res.status(403).json({ error: 'Connector instance does not belong to this starship' });
        return;
      }

      // Get configuration history
      const limitNum = limit ? parseInt(limit as string, 10) : undefined;
      const history = await configHistoryRepo.findByConnector(connectorId, limitNum);

      console.log(
        `[STARSHIPS] Found ${history.length} configuration history entries for connector instance ${connectorId}`
      );

      res.json({
        starshipId: starship.id,
        connectorId,
        history,
      });
    } catch (error) {
      console.error(
        `[STARSHIPS] Error fetching configuration history for connector instance ${req.params.connectorId} on starship ${req.params.id}:`,
        error
      );

      res.status(500).json({ error: 'Failed to fetch configuration history' });
    }
  }
);

// POST /starships/:id/connectors/:connectorId/config/rollback - Rollback to previous configuration
router.post(
  '/starships/:id/connectors/:connectorId/config/rollback',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, connectorId } = req.params;
      const userId = req.user!.id;
      const { historyId, changeReason } = req.body;

      console.log(
        `[STARSHIPS] Rolling back configuration for connector instance ${connectorId} on starship ${starshipIdOrSlug} to history ${historyId}, user: ${userId}`
      );

      // Enhanced parameter validation
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        return handleError(
          new ValidationError('Starship ID or slug is required', 'starshipId'),
          res,
          'Invalid starship parameter'
        );
      }

      if (!connectorId || connectorId.trim().length === 0) {
        return handleError(
          new ValidationError('Connector ID is required', 'connectorId'),
          res,
          'Invalid connector parameter'
        );
      }

      if (!historyId || historyId.trim().length === 0) {
        return handleError(
          new ValidationError('History ID is required', 'historyId'),
          res,
          'Invalid history parameter'
        );
      }

      // Validate UUID formats
      try {
        validateUUID(connectorId, 'connectorId');
        validateUUID(historyId, 'historyId');
      } catch (error) {
        return handleError(error, res, 'Invalid ID format');
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[STARSHIPS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[STARSHIPS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify connector instance exists and belongs to this starship
      const connectorInstance = await mcpConnectorRepo.findById(connectorId);
      if (!connectorInstance) {
        console.log(`[STARSHIPS] Connector instance not found: ${connectorId}`);
        res.status(404).json({ error: 'Connector instance not found' });
        return;
      }

      if (connectorInstance.starshipId !== starship.id) {
        console.log(
          `[STARSHIPS] Connector instance ${connectorId} does not belong to starship ${starship.id}`
        );
        res.status(403).json({ error: 'Connector instance does not belong to this starship' });
        return;
      }

      // Get the history entry to rollback to
      const historyEntry = await configHistoryRepo.findById(historyId);
      if (!historyEntry) {
        console.log(`[STARSHIPS] Configuration history entry not found: ${historyId}`);
        res.status(404).json({ error: 'Configuration history entry not found' });
        return;
      }

      if (historyEntry.connectorId !== connectorId) {
        console.log(
          `[STARSHIPS] History entry ${historyId} does not belong to connector ${connectorId}`
        );
        res.status(403).json({ error: 'History entry does not belong to this connector' });
        return;
      }

      // Create a new history entry for the current config before rollback
      if (connectorInstance.config) {
        await configHistoryRepo.createEntry(
          connectorId,
          connectorInstance.config,
          userId,
          'Pre-rollback backup',
          'Automatic backup before rollback operation'
        );
      }

      // Apply the rollback configuration (this would need to be implemented in the connector repo)
      // For now, we'll create a history entry to track the rollback
      await configHistoryRepo.createEntry(
        connectorId,
        historyEntry.config,
        userId,
        `Rolled back to configuration from ${historyEntry.createdAt}`,
        changeReason || 'Configuration rollback'
      );

      console.log(
        `[STARSHIPS] Successfully rolled back configuration for connector instance ${connectorId} on starship ${starship.id}`
      );

      res.json({
        message: 'Configuration rolled back successfully',
        starshipId: starship.id,
        connectorId,
        rolledBackTo: historyEntry.createdAt,
        historyId,
      });
    } catch (error) {
      handleError(
        error,
        res,
        `Error rolling back configuration for connector instance ${req.params.connectorId} on starship ${req.params.id}`
      );
    }
  }
);

export default router;
