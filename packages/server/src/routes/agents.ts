import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';
import { AgentService } from '../services/AgentService';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';

const router: Router = Router();

// Zod schemas for validation
const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
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
  starshipId: z.string().regex(/^[a-z0-9]{10,30}$/i, 'Invalid starship ID'),
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
  starshipId: z
    .string()
    .regex(/^[a-z0-9]{10,30}$/i, 'Invalid starship ID')
    .optional(),
});

const StarshipAssignmentSchema = z.object({
  starshipId: z.string().regex(/^[a-z0-9]{10,30}$/i, 'Invalid starship ID'),
});

const ToolAssignmentSchema = z.object({
  toolSlugs: z.array(z.string().min(1)).min(1, 'At least one tool slug is required'),
});

const SingleToolAssignmentSchema = z.object({
  toolSlug: z.string().min(1, 'Tool slug is required'),
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

// PUT /agents/:id/starship - Update agent starship assignment (OpenAPI pattern)
router.put('/agents/:id/starship', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(StarshipAssignmentSchema, req.body, res, 'starship assignment data');
    if (!bodyValidation) return;

    const { id: agentId } = paramValidation;
    const { starshipId } = bodyValidation;

    console.log(`[AGENTS] Updating agent ${agentId} starship assignment to: ${starshipId}`);

    // Delegate to service layer
    const agentService = new AgentService();
    const agent = await agentService.updateAgentStarship(agentId, starshipId);

    sendSuccess(res, {
      message: 'Agent starship assignment updated successfully',
      agent,
    });
  } catch (error) {
    console.error('[AGENTS] Error updating agent starship assignment:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update agent starship assignment');
  }
});

// GET /starships/:starshipId/agents - Fetch agents by starship (OpenAPI pattern)
router.get('/starships/:starshipId/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate starshipId parameter
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    // Validate query parameters
    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    // Delegate to service layer
    const agentService = new AgentService();
    const result = await agentService.getAgentsByStarshipWithAccess(
      paramValidation.starshipId,
      req.user!.id,
      queryValidation.page,
      queryValidation.limit
    );

    sendSuccess(res, result.agents, 200, { pagination: result.pagination });
  } catch (error) {
    console.error('[AGENTS] Error fetching starship agents:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship agents');
  }
});

// GET /agents/:id - Get specific agent (OpenAPI pattern)
router.get('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Delegate to service layer
    const agentService = new AgentService();
    const agent = await agentService.getAgent(paramValidation.id);

    sendSuccess(res, agent);
  } catch (error) {
    console.error('[AGENTS] Error getting agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get agent');
  }
});

// GET /agents - List agents with filtering and pagination (OpenAPI pattern)
router.get('/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate query parameters
    const queryValidation = validateData(
      PaginationSchema.extend({
        starshipId: IdSchema.optional(),
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const { page, limit, starshipId } = queryValidation;
    const agentService = new AgentService();

    if (starshipId) {
      // Get agents by starship with access control
      const result = await agentService.getAgentsByStarshipWithAccess(starshipId, req.user!.id, page, limit);
      sendSuccess(res, result.agents, 200, { pagination: result.pagination });
    } else {
      // Get all agents with pagination
      const result = await agentService.getAgentsWithPagination(page, limit);
      sendSuccess(res, result.agents, 200, { pagination: result.pagination });
    }
  } catch (error) {
    console.error('[AGENTS] Error loading agents:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to load agents');
  }
});

// GET /agents/public - List public agents with pagination (OpenAPI pattern)
router.get('/agents/public', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate query parameters
    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    // Delegate to service layer
    const agentService = new AgentService();
    const result = await agentService.getAgentsWithPagination(queryValidation.page, queryValidation.limit);

    sendSuccess(res, result.agents, 200, { pagination: result.pagination });
  } catch (error) {
    console.error('[AGENTS] Error loading public agents:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to load public agents');
  }
});

// GET /agents/search - Search agents (OpenAPI pattern)
router.get('/agents/search', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate search query parameter
    const query = req.query.q as string;
    if (!query) {
      sendError(res, 'MISSING_REQUIRED_FIELD', 'Search query is required', 400, {
        field: 'q',
        description: 'Query parameter "q" is required for search',
      });
      return;
    }

    // Delegate to service layer
    const agentService = new AgentService();
    const agents = await agentService.searchAgents(query);

    sendSuccess(res, agents);
  } catch (error) {
    console.error('[AGENTS] Error searching agents:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to search agents');
  }
});

// POST /agents - Create new agent (OpenAPI pattern)
router.post('/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const bodyValidation = validateData(CreateAgentSchema, req.body, res, 'agent creation data');
    if (!bodyValidation) return;

    const agentService = new AgentService();
    const agent = await agentService.createAgent(req.body);
    console.log(`[AGENTS] Agent created successfully: ${agent.id}`);

    sendSuccess(res, agent, 201);
  } catch (error) {
    console.error('[AGENTS] Error creating agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create agent');
  }
});

// PUT /agents/:id - Update agent (OpenAPI pattern)
router.put('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(UpdateAgentSchema, req.body, res, 'agent update data');
    if (!bodyValidation) return;

    const { id } = paramValidation;
    const updates = bodyValidation;

    if (updates.starshipId) {
      console.log(`[AGENTS] Updating agent ${id} with new starshipId: ${updates.starshipId}`);
    }

    // Delegate to service layer
    const agentService = new AgentService();
    const agent = await agentService.updateAgent(id, updates as any);

    sendSuccess(res, agent);
  } catch (error) {
    console.error('[AGENTS] Error updating agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update agent');
  }
});

// DELETE /agents/:id - Delete agent (OpenAPI pattern)
router.delete('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Delegate to service layer
    const agentService = new AgentService();
    const deleted = await agentService.deleteAgent(paramValidation.id);

    sendSuccess(res, { message: 'Agent deleted successfully' }, 200);
  } catch (error) {
    console.error('[AGENTS] Error deleting agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete agent');
  }
});

// ============================================================================
// TOOL ASSIGNMENT ENDPOINTS
// ============================================================================

// GET /agents/:id/tools - Get tools assigned to an agent (OpenAPI pattern)
router.get('/agents/:id/tools', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Validate starshipId query parameter
    const queryValidation = validateData(z.object({ starshipId: IdSchema }), req.query, res, 'query parameters');
    if (!queryValidation) return;

    const { id: agentId } = paramValidation;
    const { starshipId } = queryValidation;

    // Delegate to service layer
    const agentService = new AgentService();
    const tools = await agentService.getAgentTools(agentId, starshipId);

    sendSuccess(res, tools);
  } catch (error) {
    console.error('[AGENTS] Error getting agent tools:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get agent tools');
  }
});

// PUT /agents/:id/tools - Assign tools to an agent (OpenAPI pattern)
router.put('/agents/:id/tools', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Validate request body with starshipId
    const bodyValidation = validateData(
      ToolAssignmentSchema.extend({
        starshipId: IdSchema,
      }),
      req.body,
      res,
      'tool assignment data'
    );
    if (!bodyValidation) return;

    const { id: agentId } = paramValidation;
    const { toolSlugs, starshipId } = bodyValidation;

    console.log(`[AGENTS] Assigning ${toolSlugs.length} tools to agent ${agentId} on starship ${starshipId}: ${toolSlugs.join(', ')}`);

    // Delegate to service layer
    const agentService = new AgentService();
    const agent = await agentService.assignToolSlugs(agentId, toolSlugs, starshipId);

    sendSuccess(res, {
      message: 'Tools assigned to agent successfully',
      agent,
    });
  } catch (error) {
    console.error('[AGENTS] Error assigning tools to agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to assign tools to agent');
  }
});

// POST /agents/:id/tools/:toolSlug - Assign a specific tool to agent (OpenAPI pattern)
router.post('/agents/:id/tools/:toolSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate parameters
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        toolSlug: z.string().min(1, 'Tool slug is required'),
      }),
      req.params,
      res,
      'agent and tool parameters'
    );
    if (!paramValidation) return;

    // Validate request body for starshipId
    const bodyValidation = validateData(
      z.object({
        starshipId: IdSchema,
      }),
      req.body,
      res,
      'starship data'
    );
    if (!bodyValidation) return;

    const { id: agentId, toolSlug } = paramValidation;
    const { starshipId } = bodyValidation;

    console.log(`[AGENTS] Adding tool ${toolSlug} to agent ${agentId} on starship ${starshipId}`);

    // Delegate to service layer
    const agentService = new AgentService();
    const agent = await agentService.addToolSlug(agentId, toolSlug, starshipId);

    sendSuccess(res, {
      message: `Tool ${toolSlug} assigned to agent successfully`,
      agent,
    });
  } catch (error) {
    console.error('[AGENTS] Error adding tool to agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to add tool to agent');
  }
});

// DELETE /agents/:id/tools/:toolSlug - Remove a tool from agent (OpenAPI pattern)
router.delete('/agents/:id/tools/:toolSlug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate parameters
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        toolSlug: z.string().min(1, 'Tool slug is required'),
      }),
      req.params,
      res,
      'agent and tool parameters'
    );
    if (!paramValidation) return;

    // Validate query parameters for starshipId
    const queryValidation = validateData(
      z.object({
        starshipId: IdSchema,
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const { id: agentId, toolSlug } = paramValidation;
    const { starshipId } = queryValidation;

    console.log(`[AGENTS] Removing tool ${toolSlug} from agent ${agentId} on starship ${starshipId}`);

    // Delegate to service layer
    const agentService = new AgentService();
    const agent = await agentService.removeToolSlug(agentId, toolSlug, starshipId);

    sendSuccess(res, {
      message: `Tool ${toolSlug} removed from agent successfully`,
      agent,
    });
  } catch (error) {
    console.error('[AGENTS] Error removing tool from agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to remove tool from agent');
  }
});

export default router;
