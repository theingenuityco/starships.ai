import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { IdSchema, PaginationSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { validateData } from '@/utils/validation';
import { AgentService } from '../services/AgentService';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { AgentModel } from '@starships/protocol';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';
import { StarshipService } from '@/services/StarshipService';

const router: Router = Router();

const AGENT_KINDS = ['claude-code', 'codex', 'hermes', 'openclaw', 'custom'] as const;
const AGENT_ACCESS_ROLES = ['viewer', 'contributor'] as const;

const NameSchema = z.string().min(1).max(100).refine(noXSS, { message: XSS_ERROR_MESSAGE });
const DescriptionSchema = z.string().max(500).refine(noXSS, { message: XSS_ERROR_MESSAGE });

const CreateAgentSchema = z.object({
  starshipId: IdSchema,
  name: NameSchema,
  kind: z.enum(AGENT_KINDS),
  accessRole: z.enum(AGENT_ACCESS_ROLES).optional(),
  description: DescriptionSchema.optional(),
});

const UpdateAgentSchema = z.object({
  name: NameSchema.optional(),
  kind: z.enum(AGENT_KINDS).optional(),
  accessRole: z.enum(AGENT_ACCESS_ROLES).optional(),
  description: DescriptionSchema.optional(),
});

// GET /starships/:starshipId/agents - List a starship's registered agents
router.get('/starships/:starshipId/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const queryValidation = validateData(
      PaginationSchema.extend({
        order: z.enum(['ASC', 'DESC']).optional(),
        search: z.string().trim().max(200).refine(noXSS, { message: XSS_ERROR_MESSAGE }).optional(),
      }),
      req.query,
      res,
      'pagination query'
    );
    if (!queryValidation) return;

    const agentService = new AgentService();
    const result = await agentService.getAgentsByStarshipWithAccess(
      paramValidation.starshipId,
      req.user!.id,
      queryValidation.page,
      queryValidation.limit,
      queryValidation.order,
      typeof queryValidation.search === 'string' && queryValidation.search.trim().length > 0 ? queryValidation.search.trim() : undefined
    );

    sendSuccess(res, result.agents, 200, { pagination: result.pagination });
  } catch (error) {
    console.error('[AGENTS] Error fetching starship agents:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship agents');
  }
});

// GET /starships/:starshipId/agents/:slug - Get agent by slug within a starship
router.get('/starships/:starshipId/agents/:slug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(
      z.object({ starshipId: IdSchema, slug: z.string().min(1).max(255) }),
      req.params,
      res,
      'starship and slug parameters'
    );
    if (!paramValidation) return;

    const { starshipId, slug } = paramValidation;
    const agentService = new AgentService();

    const hasAccess = await agentService.validateStarshipAccess(starshipId, req.user!.id);
    if (!hasAccess) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    const starshipAgents = await agentService.getAgentsByStarship(starshipId);
    const agent = starshipAgents.find((a) => a.slug === slug) || null;
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', slug, starshipId });
      return;
    }

    sendSuccess(res, agent);
  } catch (error) {
    console.error('[AGENTS] Error getting agent by slug for starship:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get agent');
  }
});

// GET /agents/search - Search agents (defined before /agents/:slugOrId)
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
    const agents = await agentService.searchAgents(query);
    sendSuccess(res, agents);
  } catch (error) {
    console.error('[AGENTS] Error searching agents:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to search agents');
  }
});

// GET /agents - List agents across the user's starships
router.get('/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const queryValidation = validateData(
      PaginationSchema.extend({ starshipId: IdSchema.optional() }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const { page, limit, starshipId } = queryValidation;
    const agentService = new AgentService();

    if (starshipId) {
      const ok = await verifyStarshipAccess(starshipId, req.user!.id, res);
      if (!ok) return;

      const result = await agentService.getAgentsByStarshipWithAccess(starshipId, req.user!.id, page, limit);
      sendSuccess(res, result.agents, 200, { pagination: result.pagination });
    } else {
      const starshipService = new StarshipService();
      const userStarships = await starshipService.getStarshipsByOwner(req.user!.id);

      let allAgents: AgentModel[] = [];
      for (const s of userStarships) {
        const agents = await agentService.getAgentsByStarship(s.id);
        if (Array.isArray(agents) && agents.length > 0) allAgents = allAgents.concat(agents);
      }

      const total = allAgents.length;
      const offset = (page - 1) * limit;
      const paginatedAgents = allAgents.slice(offset, offset + limit);
      sendSuccess(res, paginatedAgents, 200, {
        pagination: { page, limit, total, has_next: offset + limit < total, has_prev: page > 1 },
      });
    }
  } catch (error) {
    console.error('[AGENTS] Error loading agents:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to load agents');
  }
});

// GET /agents/:slugOrId - Get a single agent by id (id-only; slugs are per-starship)
router.get('/agents/:slugOrId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ slugOrId: z.string().min(1).max(255) }), req.params, res, 'slugOrId parameter');
    if (!paramValidation) return;

    const agentService = new AgentService();
    const agent: AgentModel | null = await agentService.getAgent(paramValidation.slugOrId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', slugOrId: paramValidation.slugOrId });
      return;
    }

    const hasAccess = await agentService.validateStarshipAccess(agent.starshipId, req.user!.id);
    if (!hasAccess) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this agent', 403, { starshipId: agent.starshipId });
      return;
    }

    sendSuccess(res, agent);
  } catch (error) {
    console.error('[AGENTS] Error getting agent by slugOrId:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get agent');
  }
});

// POST /agents - Register a new agent
router.post('/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bodyValidation = validateData(CreateAgentSchema, req.body, res, 'agent creation data');
    if (!bodyValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const hasAccess = await verifyStarshipAccess(bodyValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const agentService = new AgentService();
    const agent = await agentService.createAgent({ ...bodyValidation, createdByUserId: userId });
    sendSuccess(res, agent, 201);
  } catch (error) {
    console.error('[AGENTS] Error creating agent:', error);
    handleError(error, res, 'creating agent');
  }
});

// PUT /agents/:id - Update a registered agent
router.put('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const bodyValidation = validateData(UpdateAgentSchema, req.body, res, 'agent update data');
    if (!bodyValidation) return;

    const { id } = paramValidation;
    const agentService = new AgentService();
    const existing = await agentService.getAgent(id);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id });
      return;
    }

    const hasAccess = await verifyResourceAccess(existing.starshipId, req.user!.id, 'agent', id, res);
    if (!hasAccess) return;

    const agent = await agentService.updateAgent(id, bodyValidation);
    sendSuccess(res, agent);
  } catch (error) {
    console.error('[AGENTS] Error updating agent:', error);
    handleError(error, res, 'updating agent');
  }
});

// DELETE /agents/:id - Remove a registered agent
router.delete('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(paramValidation.id);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: paramValidation.id });
      return;
    }

    const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', paramValidation.id, res);
    if (!hasAccess) return;

    const deleted = await agentService.deleteAgent(paramValidation.id);
    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: paramValidation.id });
      return;
    }

    sendSuccess(res, { message: 'Agent deleted successfully' }, 200);
  } catch (error) {
    console.error('[AGENTS] Error deleting agent:', error);
    handleError(error, res, 'deleting agent');
  }
});

export default router;
