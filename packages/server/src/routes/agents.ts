import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { AgentModel } from '@starships/protocol';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';
import { AgentService } from '../services/AgentService';
import {
  createPaginationMeta,
  handleCommonError,
  sendError,
  sendSuccess,
  validatePagination,
  validateUUID,
} from '../utils/responseHelpers';

const router: Router = Router();

// Zod schemas for validation
const UuidSchema = z.string().uuid('Invalid UUID format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CreateAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  category: z.enum(['general', 'coding', 'creative', 'analysis', 'support']).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
  timeout: z.number().min(1000).optional(),
  starshipId: z.string().uuid('Invalid starship ID'),
});

const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  category: z.enum(['general', 'coding', 'creative', 'analysis', 'support']).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
  timeout: z.number().min(1000).optional(),
  starshipId: z.string().uuid('Invalid starship ID').optional(),
});

const RatingSchema = z.object({
  rating: z.number().int().min(1).max(5, 'Rating must be between 1 and 5'),
});

const StarshipAssignmentSchema = z.object({
  starshipId: z.string().uuid('Invalid starship ID'),
});

// Helper function for Zod validation
const validateData = <T>(schema: z.ZodSchema<T>, data: unknown, res: Response, context: string): T | null => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path.join('.');

      sendError(res, 'VALIDATION_ERROR', firstError.message, 400, {
        field: fieldName,
        context,
        validationErrors: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', `${context} validation error`, 500);
    }
    return null;
  }
};

// Helper function for authentication check
const checkAuth = (req: Request, res: Response): boolean => {
  const user = req.user;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return false;
  }
  return true;
};

// POST /agents/:id/ratings - Rate agent (OpenAPI pattern)
router.post('/agents/:id/ratings', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: UuidSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(RatingSchema, req.body, res, 'rating data');
    if (!bodyValidation) return;

    const { id } = paramValidation;
    const { rating } = bodyValidation;

    // Delegate to service layer
    const agentService = new AgentService();
    await agentService.rateAgent(id, rating);
    sendSuccess(res, { message: 'Agent rated successfully' }, 201);
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

    // Delegate to service layer
    const agentService = new AgentService();
    await agentService.trackAgentUsage(req.params.id);

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
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: UuidSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(StarshipAssignmentSchema, req.body, res, 'starship assignment data');
    if (!bodyValidation) return;

    const { id: agentId } = paramValidation;
    const { starshipId } = bodyValidation;

    // TODO: Add validation to ensure starshipId references valid, accessible starship
    // TODO: Add validation to ensure user owns the agent and/or has access to the starship

    console.log(`[AGENTS] Updating agent ${agentId} starship assignment to: ${starshipId}`);

    // Delegate to service layer
    const agentService = new AgentService();
    const agent = await agentService.updateAgentStarship(agentId, starshipId);
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

    // Delegate to service layer
    const agentService = new AgentService();
    const allAgents = await agentService.getAgentModelsByStarship(starshipId);

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

    // Delegate to service layer
    const agentService = new AgentService();
    const agent = await agentService.getAgentModel(req.params.id);
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

    // Delegate to service layer
    const agentService = new AgentService();
    const analytics = await agentService.getAgentAnalytics(req.params.id);

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

    // Delegate to service layer
    const agentService = new AgentService();
    const allAgents = await agentService.getAgentModelsByUser(targetUserId);

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

    // Handle different query scenarios - delegate to service layer
    const agentService = new AgentService();

    if (category) {
      agents = await agentService.getAgentModelsByCategory(category as string);
    } else if (authorId) {
      agents = await agentService.getAgentModelsByUser(authorId as string);
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

      agents = await agentService.getAgentModelsByStarship(starshipId as string);
    } else if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      const filters = { tags: tagArray as string[] };
      agents = await agentService.getAgentModelsWithFilters(filters);
    } else if (isPublic === 'true') {
      const offset = (page - 1) * limit;
      agents = await agentService.getPublicAgentModels(limit, offset);
    } else {
      // Default: get user's agents + public agents
      console.log(`[AGENTS] Loading agents for user: ${userId}`);

      let userAgents: AgentModel[] = [];
      let publicAgents: AgentModel[] = [];

      try {
        userAgents = await agentService.getAgentModelsByUser(userId);
        console.log(`[AGENTS] Found ${userAgents.length} user agents`);
      } catch (userError: any) {
        console.error(`[AGENTS] Failed to get user agents:`, userError);
        // Continue with empty user agents array
      }

      try {
        publicAgents = await agentService.getPublicAgentModels(50, 0);
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
    const agentService = new AgentService();
    const agents = await agentService.getPublicAgentModels(limit, offset);

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

    const agentService = new AgentService();
    const agents = await agentService.searchAgentModels(query);
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
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(CreateAgentSchema, req.body, res, 'agent creation data');
    if (!bodyValidation) return;

    const userId = req.user!.id;

    // TODO: Add validation to ensure starshipId references valid, accessible starship

    // Add user ID from auth context and provide defaults
    const agentData = {
      ...bodyValidation,
      authorId: userId, // Override with authenticated user ID
      category: bodyValidation.category || 'general', // Default category
      model: bodyValidation.model || 'gpt-3.5-turbo', // Default model
      timeout: bodyValidation.timeout || 30000,
      version: '1.0.0', // Default version for all new agents
    };

    console.log(`[AGENTS] Creating agent with authorId: ${agentData.authorId}, starshipId: ${agentData.starshipId} for user: ${userId}`);

    const agentService = new AgentService();
    const agent = await agentService.createAgentModel(agentData);
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
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: UuidSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(UpdateAgentSchema, req.body, res, 'agent update data');
    if (!bodyValidation) return;

    const { id } = paramValidation;
    const updates = bodyValidation;

    if (updates.starshipId) {
      console.log(`[AGENTS] Updating agent ${id} with new starshipId: ${updates.starshipId}`);
    }

    const agentService = new AgentService();
    const agent = await agentService.updateAgentModel(id, updates as any);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        id: id,
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

    const agentService = new AgentService();
    const deleted = await agentService.deleteAgent(req.params.id);
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
