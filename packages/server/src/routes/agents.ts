import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { IdSchema, PaginationSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { validateData } from '@/utils/validation';
import { AgentService } from '../services/AgentService';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { AgentModel } from '@starships/protocol';
import type { AuthUser } from '@starships/protocol';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';
import { StarshipService } from '@/services/StarshipService';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { AvatarGenerationService } from '@/services/AvatarGenerationService';
import { AttachmentService } from '@/services/AttachmentService';

const router: Router = Router();

function requireInstanceAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
    sendError(res, 'FORBIDDEN', 'Only instance admins can access agent approvals', 403);
    return;
  }
  next();
}

// Enforce auth + instance-admin for all agent publication approval endpoints.
router.use('/admin/agents', jwtAuthMiddleware, requireInstanceAdminMiddleware);

// Zod schemas for validation
// Using standard pagination schema for consistency

// Shared validation for preview prompts
const PreviewPromptItem = z.string().trim().min(1).max(120);
const PreviewPromptsSchema = z
  .array(PreviewPromptItem)
  .max(10)
  .refine((arr) => new Set(arr.map((s) => s.toLowerCase())).size === arr.length, {
    message: 'Preview prompts must be unique (case-insensitive)',
  });

const CreateAgentSchema = z.object({
  slug: z.string().min(1).max(100).optional(),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters')
    .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
  description: z
    .string()
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  systemPrompt: z.string().optional(),
  category: z.enum(['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation']).optional(),
  tags: z.array(z.string().refine(noXSS, { message: XSS_ERROR_MESSAGE })).optional(),
  isPublic: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
  timeout: z.number().min(1000).optional(),
  previewPrompts: PreviewPromptsSchema.optional(),
  sourceTemplateId: z.string().min(1).optional(),
  starshipId: z.string().min(1, 'Starship ID is required'),
});

const UpdateAgentSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  description: z
    .string()
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  systemPrompt: z.string().optional(),
  category: z.enum(['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation']).optional(),
  tags: z.array(z.string().refine(noXSS, { message: XSS_ERROR_MESSAGE })).optional(),
  isPublic: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
  timeout: z.number().min(1000).optional(),
  sourceTemplateId: z.string().min(1).optional(),
  previewPrompts: PreviewPromptsSchema.optional(),
  starshipId: z.string().min(1, 'Starship ID is required').optional(),
});

const StarshipAssignmentSchema = z.object({
  starshipId: z.string().min(1, 'Starship ID is required'),
});

const ToolAssignmentSchema = z.object({
  toolSlugs: z.array(z.string().min(1)).min(1, 'At least one tool slug is required'),
});

const TestAgentSchema = z.object({
  input: z.union([
    z.string(), // Simple text input
    z.array(
      z.object({
        // Messages array
        role: z.enum(['user', 'assistant', 'system', 'tool']),
        content: z.string(),
        reasoning: z.string().optional(),
      })
    ),
  ]),
  parentConversationId: z.string().min(1).optional(),
});

const ToolPublishOverrideSchema = z.object({
  toolId: IdSchema,
  versionBump: z.enum(['patch', 'minor', 'major']),
  changelog: z
    .string()
    .min(1, 'Changelog is required')
    .max(2000, 'Changelog must be at most 2000 characters')
    .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
});

const PublishRequestSchema = z.object({
  versionBump: z.enum(['patch', 'minor', 'major']),
  changelog: z
    .string()
    .min(1, 'Changelog is required')
    .max(2000, 'Changelog must be at most 2000 characters')
    .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
  toolOverrides: z.array(ToolPublishOverrideSchema).optional(),
});

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

    const agentService = new AgentService();

    // Load agent and validate existence
    const existing = await agentService.getAgent(agentId);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    // Verify caller owns the agent's current starship
    const hasAgentAccess = await verifyResourceAccess(existing.starshipId, req.user!.id, 'agent', agentId, res);
    if (!hasAgentAccess) return;

    // Verify caller owns the destination starship
    const hasDestAccess = await verifyStarshipAccess(starshipId, req.user!.id, res);
    if (!hasDestAccess) return;

    console.log(`[AGENTS] Updating agent ${agentId} starship assignment to: ${starshipId}`);

    // Delegate to service layer
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

// GET /starships/:starshipId/agents/:slug - Get agent by slug within a starship (for tools)
router.get('/starships/:starshipId/agents/:slug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate parameters
    const paramValidation = validateData(
      z.object({
        starshipId: IdSchema,
        slug: z.string().min(1).max(255),
      }),
      req.params,
      res,
      'starship and slug parameters'
    );
    if (!paramValidation) return;

    const { starshipId, slug } = paramValidation;
    const agentService = new AgentService();

    // Validate access to the starship
    const userId = req.user!.id;
    const hasAccess = await agentService.validateStarshipAccess(starshipId, userId);
    if (!hasAccess) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Fetch agents for starship and find by slug to ensure membership without relying on starshipId typing
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

// GET /agents/:slugOrId - Get agent by slug or ID (OpenAPI pattern)
router.get('/agents/:slugOrId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate parameters - accept any string for slugOrId
    const paramValidation = validateData(
      z.object({
        slugOrId: z.string().min(1).max(255),
      }),
      req.params,
      res,
      'slugOrId parameter'
    );
    if (!paramValidation) return;

    const agentService = new AgentService();

    // Always try slug first
    let agent: AgentModel | null = await agentService.getAgentBySlug(paramValidation.slugOrId);

    // If not found by slug, try to find by ID
    if (!agent) {
      agent = await agentService.getAgent(paramValidation.slugOrId);
    }

    // If still not found, return 404
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        slugOrId: paramValidation.slugOrId,
      });
      return;
    }

    // Enforce access: user must have access to the agent's starship
    const userId = req.user!.id;
    const hasAccess = await agentService.validateStarshipAccess(agent.starshipId, userId);
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
      // Verify access to requested starship
      const ok = await verifyStarshipAccess(starshipId, req.user!.id, res);
      if (!ok) return;

      const result = await agentService.getAgentsByStarshipWithAccess(starshipId, req.user!.id, page, limit);
      sendSuccess(res, result.agents, 200, { pagination: result.pagination });
    } else {
      // Filter to only agents from user's starships
      const starshipService = new StarshipService();
      const userStarships = await starshipService.getStarshipsByOwner(req.user!.id);
      const starshipIds = userStarships.map((s) => s.id);

      let allAgents: AgentModel[] = [];
      for (const sid of starshipIds) {
        const agents = await agentService.getAgentsByStarship(sid);
        if (Array.isArray(agents) && agents.length > 0) {
          allAgents = allAgents.concat(agents);
        }
      }

      const total = allAgents.length;
      const offset = (page - 1) * limit;
      const paginatedAgents = allAgents.slice(offset, offset + limit);
      const pagination = {
        page,
        limit,
        total,
        has_next: offset + limit < total,
        has_prev: page > 1,
      };

      sendSuccess(res, paginatedAgents, 200, { pagination });
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

    // Authorization: ensure caller owns the target starship
    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    const hasAccess = await verifyStarshipAccess(bodyValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const agentService = new AgentService();
    const agent = await agentService.createAgent(req.body);
    console.log(`[AGENTS] Agent created successfully: ${agent.id}`);

    sendSuccess(res, agent, 201);
  } catch (error) {
    console.error('[AGENTS] Error creating agent:', error);
    handleError(error, res, 'creating agent');
  }
});

/**
 * POST /agents/:id/avatar/generate
 * Generates an agent avatar image via OpenRouter image model and stores it as an attachment.
 */
router.post('/agents/:id/avatar/generate', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;
    const { id: agentId } = paramValidation;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    // Access check: caller must have access to the agent's starship
    const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res);
    if (!hasAccess) return;

    // Ensure we have an agent-authored "mirror" description saved for this agent.
    const generator = new AvatarGenerationService();
    let avatarPrompt = (agent as any).avatarPrompt as string | undefined;
    if (!avatarPrompt || avatarPrompt.trim().length === 0) {
      const mirrorResult = await generator.generateMirrorDescription({
        agentModel: agent.model,
        agentName: agent.name,
        agentDescription: agent.description,
        agentSystemPrompt: (agent as any).systemPrompt as string | undefined,
        starshipId: agent.starshipId,
      });
      avatarPrompt = mirrorResult.description;
      // Persist on agent for future avatar generations
      await agentService.updateAgent(agent.id, { avatarPrompt } as any);
    }

    // Generate avatar via Autopilot runner/OpenRouter
    const gen = await generator.generateAvatar({
      subjectName: agent.name,
      subjectDescription: agent.description,
      subjectAvatarPrompt: avatarPrompt,
      starshipId: agent.starshipId,
    });

    // Store as attachment (auth-scoped)
    const attachmentService = new AttachmentService();
    const filename = `agent-${agent.slug || agent.id}-avatar.${gen.mimeType.includes('png') ? 'png' : gen.mimeType.includes('jpeg') ? 'jpg' : 'img'}`;
    const attachment = await attachmentService.createAttachment({
      starshipId: agent.starshipId,
      conversationId: `agent-avatar-${agent.id}`,
      filename,
      mimeType: gen.mimeType,
      buffer: gen.buffer,
    });

    // Persist link on agent
    const updated = await agentService.updateAgent(agent.id, { avatarAttachmentId: attachment.id } as any);

    sendSuccess(res, {
      agent: updated,
      attachment,
    });
  } catch (error) {
    handleError(error, res, 'generating agent avatar');
  }
});

/**
 * DELETE /agents/:id/avatar
 * Removes the stored avatar reference (and deletes the attachment).
 */
router.delete('/agents/:id/avatar', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;
    const { id: agentId } = paramValidation;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res);
    if (!hasAccess) return;

    const attachmentId = (agent as any).avatarAttachmentId as string | undefined;
    if (attachmentId) {
      const attachmentService = new AttachmentService();
      try {
        await attachmentService.deleteAttachment(attachmentId, agent.starshipId);
      } catch (e) {
        // Non-fatal; proceed to detach
        console.warn('[AGENT-AVATAR] Failed to delete attachment:', e instanceof Error ? e.message : String(e));
      }
    }

    const updated = await agentService.updateAgent(agent.id, { avatarAttachmentId: undefined } as any);

    sendSuccess(res, { agent: updated });
  } catch (error) {
    handleError(error, res, 'deleting agent avatar');
  }
});

// POST /agents/:id/publish-request - Request publication (owner or instance admin)
router.post('/agents/:id/publish-request', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const { id: agentId } = paramValidation;
    const userId = req.user!.id;

    // Validate publish request body (version bump + changelog)
    const bodyValidation = validateData(PublishRequestSchema, req.body, res, 'publish request data');
    if (!bodyValidation) return;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    // Ensure caller owns the agent's starship or is instance admin
    const hasAccess = await verifyResourceAccess(agent.starshipId, userId, 'agent', agentId, res);
    if (!hasAccess) return;

    const updated = await agentService.requestPublication(agentId, userId, {
      versionBump: bodyValidation.versionBump,
      changelog: bodyValidation.changelog,
      toolOverrides: bodyValidation.toolOverrides || [],
    });
    sendSuccess(res, {
      message: 'Publication requested successfully',
      agent: updated,
    });
  } catch (error) {
    console.error('[AGENTS] Error requesting agent publication:', error);
    handleError(error, res, 'requesting agent publication');
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

    // Authorization: ensure caller owns the starship that owns this agent
    const agentService = new AgentService();
    const existing = await agentService.getAgent(id);
    if (!existing) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id });
      return;
    }

    const hasAccess = await verifyResourceAccess(existing.starshipId, req.user!.id, 'agent', id, res);
    if (!hasAccess) return;

    // Authorization: if changing starshipId, verify user owns the destination starship
    if (updates.starshipId && updates.starshipId !== existing.starshipId) {
      const hasDestAccess = await verifyStarshipAccess(updates.starshipId, req.user!.id, res);
      if (!hasDestAccess) return;
    }

    const agent = await agentService.updateAgent(id, updates);
    sendSuccess(res, agent);
  } catch (error) {
    console.error('[AGENTS] Error updating agent:', error);
    handleError(error, res, 'updating agent');
  }
});

// DELETE /agents/:id - Delete agent (OpenAPI pattern)
router.delete('/agents/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate agent ID parameter
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    // Authorization: ensure caller owns the starship that owns this agent
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

// POST /starships/:starshipId/agents/:slug/test - Test agent execution
router.post('/starships/:starshipId/agents/:slug/test', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate parameters
    const paramValidation = validateData(
      z.object({
        starshipId: IdSchema,
        slug: z.string().min(1).max(255),
      }),
      req.params,
      res,
      'starship and slug parameters'
    );
    if (!paramValidation) return;

    // Validate test input
    const bodyValidation = validateData(TestAgentSchema, req.body, res, 'test input data');
    if (!bodyValidation) return;

    const { starshipId, slug } = paramValidation;
    const { input, parentConversationId } = bodyValidation;
    const userId = req.user!.id;

    const agentService = new AgentService();

    // Validate access to the starship
    const hasAccess = await agentService.validateStarshipAccess(starshipId, userId);
    if (!hasAccess) {
      sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403);
      return;
    }

    // Get agent by slug
    const starshipAgents = await agentService.getAgentsByStarship(starshipId);
    const agent = starshipAgents.find((a) => a.slug === slug);

    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, {
        resource: 'agent',
        slug,
        starshipId,
      });
      return;
    }

    // Execute agent test
    const testResult = await agentService.testAgent(agent.id, input, starshipId, userId, parentConversationId);

    sendSuccess(res, {
      success: testResult.success,
      data: testResult,
    });
  } catch (error) {
    console.error('[AGENTS] Error testing agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to test agent');
  }
});

// ============================================================================
// ADMIN PUBLICATION APPROVAL ROUTES (INSTANCE ADMIN ONLY)
// ============================================================================

// GET /admin/agents/pending - List agents pending approval
router.get('/admin/agents/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    const agentService = new AgentService();
    const result = await agentService.getPendingAgents(queryValidation.page, queryValidation.limit);

    sendSuccess(res, result.agents, 200, { pagination: result.pagination });
  } catch (error) {
    console.error('[AGENTS] Error loading pending agents:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to load pending agents');
  }
});

// GET /admin/agents/:id/tools - List tools pending publication for a specific agent
router.get('/admin/agents/:id/tools', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const { id: agentId } = paramValidation;
    const agentService = new AgentService();
    const tools = await agentService.getPendingToolsForAgent(agentId);

    sendSuccess(res, tools);
  } catch (error) {
    console.error('[AGENTS] Error loading pending agent tools:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to load pending agent tools');
  }
});

// POST /admin/agents/:id/approve - Approve pending agent publication
router.post('/admin/agents/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const { id: agentId } = paramValidation;
    const adminUserId = req.user!.id;

    const agentService = new AgentService();
    const updated = await agentService.approvePublication(agentId, adminUserId);

    sendSuccess(res, {
      message: 'Agent publication approved',
      agent: updated,
    });
  } catch (error) {
    console.error('[AGENTS] Error approving agent publication:', error);
    handleError(error, res, 'approving agent publication');
  }
});

// POST /admin/agents/:id/reject - Reject pending agent publication
router.post('/admin/agents/:id/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const { id: agentId } = paramValidation;
    const adminUserId = req.user!.id;

    const agentService = new AgentService();
    const updated = await agentService.rejectPublication(agentId, adminUserId);

    sendSuccess(res, {
      message: 'Agent publication rejected',
      agent: updated,
    });
  } catch (error) {
    console.error('[AGENTS] Error rejecting agent publication:', error);
    handleError(error, res, 'rejecting agent publication');
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

    const { id: agentId } = paramValidation;
    const userId = req.user!.id;

    const agentService = new AgentService();
    const tools = await agentService.getAgentToolsForAgent(agentId, userId);

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

    // Validate request body without starshipId
    const bodyValidation = validateData(ToolAssignmentSchema, req.body, res, 'tool assignment data');
    if (!bodyValidation) return;

    const { id: agentId } = paramValidation;
    const { toolSlugs } = bodyValidation;
    const userId = req.user!.id;

    const agentService = new AgentService();
    const updated = await agentService.assignToolSlugsDerived(agentId, userId, toolSlugs);

    sendSuccess(res, {
      message: 'Tools assigned to agent successfully',
      agent: updated,
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

    const { id: agentId, toolSlug } = paramValidation;
    const userId = req.user!.id;

    const agentService = new AgentService();
    const updated = await agentService.addToolSlugDerived(agentId, userId, toolSlug);

    sendSuccess(res, {
      message: `Tool ${toolSlug} assigned to agent successfully`,
      agent: updated,
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

    const { id: agentId, toolSlug } = paramValidation;
    const userId = req.user!.id;

    const agentService = new AgentService();
    const updated = await agentService.removeToolSlugDerived(agentId, userId, toolSlug);

    sendSuccess(res, {
      message: `Tool ${toolSlug} removed from agent successfully`,
      agent: updated,
    });
  } catch (error) {
    console.error('[AGENTS] Error removing tool from agent:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to remove tool from agent');
  }
});

// ============================================================================
// TEMPLATE VERSIONING & UPDATE ROUTES
// ============================================================================

/**
 * POST /agents/:id/update-from-template - Update agent with latest template data
 */
router.post('/agents/:id/update-from-template', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
      }),
      req.params,
      res,
      'agent ID'
    );
    if (!paramValidation) return;

    const { id: agentId } = paramValidation;
    const userId = req.user!.id;

    // Authorization: verify caller owns the agent
    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    const hasAccess = await verifyResourceAccess(agent.starshipId, userId, 'agent', agentId, res);
    if (!hasAccess) return;

    const updated = await agentService.updateFromTemplate(agentId, userId);

    // Return minimal response - only essential fields
    sendSuccess(res, {
      id: updated.id,
      name: updated.name,
      version: updated.version,
      templateSnapshotAt: updated.templateSnapshotAt,
      updatedAt: updated.updatedAt,
      message: 'Agent updated successfully from template',
    });
  } catch (error) {
    console.error('[AGENTS] Error updating from template:', error);
    handleError(error, res, 'updating from template');
  }
});

export default router;
