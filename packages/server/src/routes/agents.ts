import { Router } from 'express';
import { AgentService } from '@/services/AgentService';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import type { Request, Response } from 'express';
import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import {
  sendSuccess,
  sendError,
  handleCommonError,
  validateUUID,
  validatePagination,
  createPaginationMeta,
} from '../utils/responseHelpers';

const router: Router = Router();

// POST /agents/:id/ratings - Rate agent (OpenAPI pattern)
router.post('/agents/:id/ratings', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { isValid, error } = validateUUID(req.params.id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const { rating } = req.body;

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      sendError(res, 'VALIDATION_ERROR', 'Rating must be a number between 1 and 5', 400, {
        field: 'rating',
        constraint: 'range_1_to_5',
        provided: rating,
      });
      return;
    }

    const result = await AgentService.rateAgent(req.params.id, req.user!.id, rating);
    if (!result) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: req.params.id,
      });
      return;
    }

    sendSuccess(res, result, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'rating agent')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to rate agent');
    }
  }
});

// POST /agents/:id/usage - Track agent usage (OpenAPI pattern)
router.post('/agents/:id/usage', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { isValid, error } = validateUUID(req.params.id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const result = await AgentService.trackUsage(req.params.id);
    if (!result) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: req.params.id,
      });
      return;
    }

    sendSuccess(res, { message: 'Usage tracked successfully' });
  } catch (error) {
    if (!handleCommonError(error, res, 'tracking agent usage')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to track usage');
    }
  }
});

// PUT /agents/:id/starship - Update agent starship assignment (OpenAPI pattern)
router.put('/agents/:id/starship', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: agentId } = req.params;
    const { starshipId } = req.body;

    // Validate agent ID
    const { isValid: agentIdValid, error: agentIdError } = validateUUID(agentId, 'id');
    if (!agentIdValid && agentIdError) {
      sendError(res, agentIdError.code, agentIdError.message, 400, agentIdError.details);
      return;
    }

    if (!starshipId) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'starshipId is required', 400, {
        field: 'starshipId',
        description: 'starshipId is required to update agent starship assignment',
      });
      return;
    }

    // Validate starshipId format
    const { isValid: starshipValid, error: starshipError } = validateUUID(starshipId, 'starshipId');
    if (!starshipValid && starshipError) {
      sendError(res, starshipError.code, starshipError.message, 400, starshipError.details);
      return;
    }

    // TODO: Add validation to ensure starshipId references valid, accessible starship
    // TODO: Add validation to ensure user owns the agent and/or has access to the starship

    console.log(`[AGENTS] Updating agent ${agentId} starship assignment to: ${starshipId}`);

    const agent = await AgentService.updateAgent(agentId, { starshipId } as UpdateAgentRequest);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: agentId,
      });
      return;
    }

    sendSuccess(res, {
      message: 'Agent starship assignment updated successfully',
      agent,
    });
  } catch (error) {
    if (!handleCommonError(error, res, 'updating agent starship assignment')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update agent starship assignment');
    }
  }
});

// GET /starships/:starshipId/agents - Fetch agents by starship (OpenAPI pattern)
router.get('/starships/:starshipId/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { starshipId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate starshipId format
    const { isValid, error } = validateUUID(starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    // Validate starship access
    const { StarshipRepository } = await import('@starships/models');
    const starshipRepository = new StarshipRepository();
    const starship = await starshipRepository.findById(starshipId);

    if (!starship) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
        resource: 'starship',
        id: starshipId,
      });
      return;
    }

    if (starship.ownerId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Parse and validate pagination parameters
    const pagination = validatePagination(req.query.page as string, req.query.limit as string);
    if (pagination.error) {
      sendError(res, pagination.error.code, pagination.error.message, 400);
      return;
    }

    // Get agents for the starship
    const allAgents = await AgentService.getAgentsByStarshipId(starshipId);

    // Apply pagination
    const startIndex = (pagination.page - 1) * pagination.limit;
    const paginatedAgents = allAgents.slice(startIndex, startIndex + pagination.limit);

    const paginationMeta = createPaginationMeta(pagination.page, pagination.limit, paginatedAgents.length);

    sendSuccess(res, paginatedAgents, 200, paginationMeta);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching starship agents')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship agents');
    }
  }
});

// GET /agents/:id - Get specific agent (OpenAPI pattern)
router.get('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { isValid, error } = validateUUID(req.params.id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const agent = await AgentService.getAgent(req.params.id);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: req.params.id,
      });
      return;
    }

    sendSuccess(res, agent);
  } catch (error) {
    if (!handleCommonError(error, res, 'getting agent')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get agent');
    }
  }
});

// GET /agents/:id/analytics - Get agent analytics (OpenAPI pattern)
router.get('/agents/:id/analytics', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { isValid, error } = validateUUID(req.params.id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const analytics = await AgentService.getAgentAnalytics(req.params.id);
    if (!analytics) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: req.params.id,
      });
      return;
    }

    sendSuccess(res, analytics);
  } catch (error) {
    if (!handleCommonError(error, res, 'getting agent analytics')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get agent analytics');
    }
  }
});

// GET /users/:userId/agents - Get agents for a user (OpenAPI pattern)
router.get('/users/:userId/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Users can only access their own agents
    if (targetUserId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'Access denied', 403);
      return;
    }

    // Validate userId format
    const { isValid, error } = validateUUID(targetUserId, 'userId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    // Parse and validate pagination parameters
    const pagination = validatePagination(req.query.page as string, req.query.limit as string);
    if (pagination.error) {
      sendError(res, pagination.error.code, pagination.error.message, 400);
      return;
    }

    // Get user agents
    const allAgents = await AgentService.getAgentsByAuthor(targetUserId);

    // Apply pagination
    const startIndex = (pagination.page - 1) * pagination.limit;
    const paginatedAgents = allAgents.slice(startIndex, startIndex + pagination.limit);

    const paginationMeta = createPaginationMeta(pagination.page, pagination.limit, paginatedAgents.length);

    sendSuccess(res, paginatedAgents, 200, paginationMeta);
  } catch (error) {
    if (!handleCommonError(error, res, 'fetching user agents')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch user agents');
    }
  }
});

// GET /agents - List agents with filtering and pagination (OpenAPI pattern)
router.get('/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, authorId, tags, isPublic, starshipId } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const { page, limit, error: paginationError } = validatePagination(req.query.page as string, req.query.limit as string);

    if (paginationError) {
      sendError(res, paginationError.code, paginationError.message, 400);
      return;
    }

    // Validate UUIDs if provided
    if (authorId && typeof authorId === 'string') {
      const { isValid, error } = validateUUID(authorId, 'authorId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }
    }

    if (starshipId && typeof starshipId === 'string') {
      const { isValid, error } = validateUUID(starshipId, 'starshipId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }
    }

    let agents: AgentModel[];

    // Handle different query scenarios
    if (category) {
      agents = await AgentService.getAgentsByCategory(category as string);
    } else if (authorId) {
      agents = await AgentService.getAgentsByAuthor(authorId as string);
    } else if (starshipId) {
      // Validate starship access
      const { StarshipRepository } = await import('@starships/models');
      const starshipRepository = new StarshipRepository();
      const starship = await starshipRepository.findById(starshipId as string);

      if (!starship) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Starship not found', 404, {
          resource: 'starship',
          id: starshipId,
        });
        return;
      }
      if (starship.ownerId !== userId) {
        sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
        return;
      }

      agents = await AgentService.getAgentsByStarshipId(starshipId as string);
    } else if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      agents = await AgentService.getAgentsByTags(tagArray as string[]);
    } else if (isPublic === 'true') {
      const offset = (page - 1) * limit;
      agents = await AgentService.getPublicAgents(limit, offset);
    } else {
      // Default: get user's agents + public agents
      console.log(`[AGENTS] Loading agents for user: ${userId}`);

      let userAgents: AgentModel[] = [];
      let publicAgents: AgentModel[] = [];

      try {
        userAgents = await AgentService.getAgentsByAuthor(userId);
        console.log(`[AGENTS] Found ${userAgents.length} user agents`);
      } catch (userError: any) {
        console.error(`[AGENTS] Failed to get user agents:`, userError);
        // Continue with empty user agents array
      }

      try {
        publicAgents = await AgentService.getPublicAgents(50, 0);
        console.log(`[AGENTS] Found ${publicAgents.length} public agents`);
      } catch (publicError: any) {
        console.error(`[AGENTS] Failed to get public agents:`, publicError);
        // Continue with empty public agents array
      }

      // Combine and deduplicate
      const allAgents = [...userAgents];
      for (const publicAgent of publicAgents) {
        if (!allAgents.find((a) => a.id === publicAgent.id)) {
          allAgents.push(publicAgent);
        }
      }
      agents = allAgents;
    }

    // Apply pagination for non-paginated scenarios
    const total = agents.length;
    const offset = (page - 1) * limit;
    const paginatedAgents = agents.slice(offset, offset + limit);

    sendSuccess(res, paginatedAgents, 200, createPaginationMeta(page, limit, total));
  } catch (error) {
    if (!handleCommonError(error, res, 'loading agents')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to load agents');
    }
  }
});

// GET /agents/public - List public agents with pagination (OpenAPI pattern)
router.get('/agents/public', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, error: paginationError } = validatePagination(req.query.page as string, req.query.limit as string);

    if (paginationError) {
      sendError(res, paginationError.code, paginationError.message, 400);
      return;
    }

    const offset = (page - 1) * limit;
    const agents = await AgentService.getPublicAgents(limit, offset);

    // For proper pagination, we'd need total count from service
    // For now, assuming the returned count represents the page
    sendSuccess(res, agents, 200, {
      pagination: {
        page,
        limit,
        total: agents.length, // This should come from service
        has_next: agents.length === limit,
        has_prev: page > 1,
      },
    });
  } catch (error) {
    if (!handleCommonError(error, res, 'loading public agents')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to load public agents');
    }
  }
});

// GET /agents/search - Search agents (OpenAPI pattern)
router.get('/agents/search', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;

    if (!query) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Search query is required', 400, {
        field: 'q',
        description: 'Query parameter "q" is required for search',
      });
      return;
    }

    const agents = await AgentService.searchAgents(query);
    sendSuccess(res, agents);
  } catch (error) {
    if (!handleCommonError(error, res, 'searching agents')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to search agents');
    }
  }
});

// POST /agents - Create new agent (OpenAPI pattern)
router.post('/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const createRequest = req.body as CreateAgentRequest & { starshipId: string };

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate required fields
    if (!createRequest.starshipId) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'starshipId is required', 400, {
        field: 'starshipId',
        description: 'All agents must be assigned to a starship. Please provide a valid starshipId.',
      });
      return;
    }

    if (!createRequest.name) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'name is required', 400, {
        field: 'name',
      });
      return;
    }

    // Validate starshipId format
    const { isValid, error } = validateUUID(createRequest.starshipId, 'starshipId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    // TODO: Add validation to ensure starshipId references valid, accessible starship

    // Add user ID from auth context
    const agentData = {
      ...createRequest,
      authorId: userId, // Override with authenticated user ID
      starshipId: createRequest.starshipId,
    };

    console.log(`[AGENTS] Creating agent with authorId: ${agentData.authorId}, starshipId: ${agentData.starshipId} for user: ${userId}`);

    const agent = await AgentService.createAgent(agentData);
    console.log(`[AGENTS] Agent created successfully: ${agent.id}, authorId: ${agent.authorId}`);

    sendSuccess(res, agent, 201);
  } catch (error) {
    if (!handleCommonError(error, res, 'creating agent')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create agent');
    }
  }
});

// PUT /agents/:id - Update agent (OpenAPI pattern)
router.put('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { isValid, error } = validateUUID(req.params.id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const updates = req.body as UpdateAgentRequest & { starshipId?: string };

    // Validate starshipId format if being updated
    if (updates.starshipId !== undefined) {
      const { isValid: starshipValid, error: starshipError } = validateUUID(updates.starshipId, 'starshipId');
      if (!starshipValid && starshipError) {
        sendError(res, starshipError.code, starshipError.message, 400, starshipError.details);
        return;
      }
      console.log(`[AGENTS] Updating agent ${req.params.id} with new starshipId: ${updates.starshipId}`);
    }

    const agent = await AgentService.updateAgent(req.params.id, updates);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: req.params.id,
      });
      return;
    }

    sendSuccess(res, agent);
  } catch (error) {
    if (!handleCommonError(error, res, 'updating agent')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update agent');
    }
  }
});

// DELETE /agents/:id - Delete agent (OpenAPI pattern)
router.delete('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { isValid, error } = validateUUID(req.params.id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const deleted = await AgentService.deleteAgent(req.params.id);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: req.params.id,
      });
      return;
    }

    sendSuccess(res, { message: 'Agent deleted successfully' }, 200);
  } catch (error) {
    if (!handleCommonError(error, res, 'deleting agent')) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete agent');
    }
  }
});

export default router;
