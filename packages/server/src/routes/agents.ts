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
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@starships/protocol';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';
import { StarshipService } from '@/services/StarshipService';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { AvatarGenerationService } from '@/services/AvatarGenerationService';
import { ProfileImageGenerationService } from '@/services/ProfileImageGenerationService';
import { AttachmentService } from '@/services/AttachmentService';
import { ImportExportService } from '@/services/ImportExportService';
import { buildAutopilotExecutionBundle } from '@/services/autopilot-execution-bundle';
import { generatePresignedUploadUrl } from '@/utils/s3-helper';
import archiver from 'archiver';

const router: Router = Router();

function safeFilenameSegment(input: string): string {
  const raw = String(input || '').trim();
  const sanitized = raw.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized.length > 0 ? sanitized : 'export';
}

function isoCompactTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function requireInstanceAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
    sendError(res, 'FORBIDDEN', 'Only instance admins can access this endpoint', 403);
    return;
  }
  next();
}

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

// Optional structured reasoning configuration forwarded to the underlying LLM node.
// Mirrors @starships/autopilot AgentParams.reasoning.
const ReasoningConfigSchema = z
  .object({
    effort: z.enum(['low', 'medium', 'high']).optional(),
    max_tokens: z.number().int().min(1).max(100000).optional(),
    exclude: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const CreateAgentSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters')
    .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
  role: z
    .string()
    .min(1, 'Role is required')
    .max(255, 'Role must be less than 255 characters')
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
  reasoning: ReasoningConfigSchema.optional(),
  timeout: z.number().min(1000).optional(),
  previewPrompts: PreviewPromptsSchema.optional(),
  starshipId: z.string().min(1, 'Starship ID is required'),
});

const UpdateAgentSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  role: z
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
  reasoning: z.union([ReasoningConfigSchema, z.null()]).optional(),
  timeout: z.number().min(1000).optional(),
  previewPrompts: PreviewPromptsSchema.optional(),
  starshipId: z.string().min(1, 'Starship ID is required').optional(),
  state: z.record(z.string(), z.unknown()).optional(), // Allow state updates (e.g., for plugins)
  avatarAttachmentId: z.string().min(1).max(255).optional(),
  avatarPrompt: z.string().max(8000).optional(),
  problemStatementsAttachmentId: z.string().min(1).max(255).optional(),
  capabilitiesAttachmentId: z.string().min(1).max(255).optional(),
  tryThesePromptsAttachmentId: z.string().min(1).max(255).optional(),
});

const StarshipAssignmentSchema = z.object({
  starshipId: z.string().min(1, 'Starship ID is required'),
});

const ToolAssignmentSchema = z.object({
  toolSlugs: z.array(z.string().min(1)).min(1, 'At least one tool slug is required'),
});

const ToolPermissionSchema = z.object({
  toolSlug: z.string().min(1, 'Tool slug is required'),
  permission: z.enum(['allow', 'ask', 'deny']),
});

const ToolPermissionsUpdateSchema = z.object({
  permissions: z.array(ToolPermissionSchema).min(1, 'At least one tool permission update is required'),
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
    const queryValidation = validateData(
      PaginationSchema.extend({
        // Match other endpoints' convention (e.g. ledger): ASC | DESC
        order: z.enum(['ASC', 'DESC']).optional(),
        search: z.string().trim().max(200).refine(noXSS, { message: XSS_ERROR_MESSAGE }).optional(),
      }),
      req.query,
      res,
      'pagination query'
    );
    if (!queryValidation) return;

    // Delegate to service layer
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

// GET /starships/:starshipId/agent-tool-permissions - Get agent↔tool permission rows for a starship
router.get('/starships/:starshipId/agent-tool-permissions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const ok = await verifyStarshipAccess(paramValidation.starshipId, req.user!.id, res);
    if (!ok) return;

    const agentService = new AgentService();
    const rows = await agentService.getStarshipAgentToolPermissions(paramValidation.starshipId, req.user!.id);
    sendSuccess(res, rows);
  } catch (error) {
    console.error('[AGENTS] Error fetching starship agent tool permissions:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch tool permissions');
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

/**
 * GET /agents/:id/export-bundle
 * Export an agent *and its assigned tools* as an npm-installable tarball (instance admin only).
 *
 * IMPORTANT: This route must be defined before GET /agents/:slugOrId.
 */
router.get('/agents/:id/export-bundle', jwtAuthMiddleware, requireInstanceAdminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(paramValidation.id);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: paramValidation.id });
      return;
    }

    const svc = new ImportExportService();
    const bundle = await svc.exportAgentsBundle([paramValidation.id]);
    const agentContainer = bundle.agents[0];

    const fromStarshipSlug = typeof agentContainer?.metadata?.fromStarshipSlug === 'string' ? agentContainer.metadata.fromStarshipSlug : 'starship';
    const fromAgentSlug = typeof agentContainer?.metadata?.fromSlug === 'string' ? agentContainer.metadata.fromSlug : agent.slug || agent.id;

    const baseName = safeFilenameSegment(`bundle-${fromStarshipSlug}-${fromAgentSlug}-${isoCompactTimestamp()}`);
    const filename = `${baseName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    const usedAgentNames = new Set<string>();
    const agentEntries: Array<{ kind: 'agent'; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> = [];
    for (let i = 0; i < bundle.agents.length; i += 1) {
      const a = bundle.agents[i];
      const slug = typeof a.metadata?.fromSlug === 'string' ? a.metadata.fromSlug : `agent-${i + 1}`;
      const base = safeFilenameSegment(slug);
      let outName = base;
      let n = 2;
      while (usedAgentNames.has(outName)) {
        outName = `${base}-${n}`;
        n += 1;
      }
      usedAgentNames.add(outName);
      const file = `agents/${outName}.json`;
      agentEntries.push({
        kind: 'agent',
        fromSlug: a.metadata?.fromSlug,
        fromStarshipSlug: a.metadata?.fromStarshipSlug,
        file,
      });
      archive.append(JSON.stringify(a, null, 2), { name: file });
    }

    const usedToolNames = new Set<string>();
    const toolEntries: Array<{ kind: 'tool'; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> = [];
    for (let i = 0; i < bundle.tools.length; i += 1) {
      const t = bundle.tools[i];
      const slug = typeof t.metadata?.fromSlug === 'string' ? t.metadata.fromSlug : `tool-${i + 1}`;
      const base = safeFilenameSegment(slug);
      let outName = base;
      let n = 2;
      while (usedToolNames.has(outName)) {
        outName = `${base}-${n}`;
        n += 1;
      }
      usedToolNames.add(outName);
      const file = `tools/${outName}.json`;
      toolEntries.push({
        kind: 'tool',
        fromSlug: t.metadata?.fromSlug,
        fromStarshipSlug: t.metadata?.fromStarshipSlug,
        file,
      });
      archive.append(JSON.stringify(t, null, 2), { name: file });
    }

    const manifest = {
      schemaVersion: '1',
      kind: 'bundle',
      exportedAt: new Date().toISOString(),
      entities: {
        agents: agentEntries,
        tools: toolEntries,
      },
    };

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    await archive.finalize();
  } catch (error) {
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        // ignore
      }
      console.error('[AGENTS] Error exporting agent bundle after headers sent:', error);
      return;
    }
    handleError(error, res, 'exporting agent bundle');
  }
});

/**
 * POST /agents/export-bundle
 * Export multiple agents (and their tools) as a single npm tarball (instance admin only).
 */
router.post('/agents/export-bundle', jwtAuthMiddleware, requireInstanceAdminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bodyValidation = validateData(
      z.object({
        agentIds: z.array(IdSchema).min(1).max(200),
      }),
      req.body,
      res,
      'bundle export request'
    );
    if (!bodyValidation) return;

    const svc = new ImportExportService();
    const bundle = await svc.exportAgentsBundle(bodyValidation.agentIds);

    const baseName = safeFilenameSegment(`bundle-${bundle.agents.length}-agents-${isoCompactTimestamp()}`);
    const filename = `${baseName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    const usedAgentNames = new Set<string>();
    const agentEntries: Array<{ kind: 'agent'; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> = [];
    for (let i = 0; i < bundle.agents.length; i += 1) {
      const a = bundle.agents[i];
      const slug = typeof a.metadata?.fromSlug === 'string' ? a.metadata.fromSlug : `agent-${i + 1}`;
      const base = safeFilenameSegment(slug);
      let outName = base;
      let n = 2;
      while (usedAgentNames.has(outName)) {
        outName = `${base}-${n}`;
        n += 1;
      }
      usedAgentNames.add(outName);
      const file = `agents/${outName}.json`;
      agentEntries.push({
        kind: 'agent',
        fromSlug: a.metadata?.fromSlug,
        fromStarshipSlug: a.metadata?.fromStarshipSlug,
        file,
      });
      archive.append(JSON.stringify(a, null, 2), { name: file });
    }

    const usedToolNames = new Set<string>();
    const toolEntries: Array<{ kind: 'tool'; fromSlug?: unknown; fromStarshipSlug?: unknown; file: string }> = [];
    for (let i = 0; i < bundle.tools.length; i += 1) {
      const t = bundle.tools[i];
      const slug = typeof t.metadata?.fromSlug === 'string' ? t.metadata.fromSlug : `tool-${i + 1}`;
      const base = safeFilenameSegment(slug);
      let outName = base;
      let n = 2;
      while (usedToolNames.has(outName)) {
        outName = `${base}-${n}`;
        n += 1;
      }
      usedToolNames.add(outName);
      const file = `tools/${outName}.json`;
      toolEntries.push({
        kind: 'tool',
        fromSlug: t.metadata?.fromSlug,
        fromStarshipSlug: t.metadata?.fromStarshipSlug,
        file,
      });
      archive.append(JSON.stringify(t, null, 2), { name: file });
    }

    const manifest = {
      schemaVersion: '1',
      kind: 'bundle',
      exportedAt: new Date().toISOString(),
      entities: {
        agents: agentEntries,
        tools: toolEntries,
      },
    };

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    await archive.finalize();
  } catch (error) {
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        // ignore
      }
      console.error('[AGENTS] Error exporting agents bundle after headers sent:', error);
      return;
    }
    handleError(error, res, 'exporting agents bundle');
  }
});

/**
 * GET /agents/:id/export
 * Export an agent as a JSON container (instance admin only).
 *
 * IMPORTANT: This route must be defined before GET /agents/:slugOrId.
 */
router.get('/agents/:id/export', jwtAuthMiddleware, requireInstanceAdminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const svc = new ImportExportService();
    const container = await svc.exportAgent(paramValidation.id);
    sendSuccess(res, container);
  } catch (error) {
    handleError(error, res, 'exporting agent');
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

    // NOTE: Agent slugs are only unique within a starship (starship_id + slug).
    // This endpoint is therefore ID-only to avoid ambiguous cross-starship slug resolution.
    const agent: AgentModel | null = await agentService.getAgent(paramValidation.slugOrId);

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

    const bodyValidation =
      validateData(
        z.object({
          /**
           * avatar_only: generate a new avatar using the existing saved avatarPrompt
           * (will generate/save avatarPrompt only if missing).
           *
           * full_chain: regenerate avatarPrompt by asking the agent ("mirror"), save it,
           * then generate a new avatar using that regenerated prompt.
           */
          mode: z.enum(['avatar_only', 'full_chain', 'migrate_2d_to_3d']).optional(),
          /**
           * Optional style switch for avatar generation.
           * - '3d': current pipeline (default)
           * - '2d': legacy pipeline
           */
          avatarMode: z.enum(['2d', '3d']).optional(),
        }),
        (req.body ?? {}) as unknown,
        res,
        'avatar generation options'
      ) ?? {};
    const mode = bodyValidation.mode ?? 'avatar_only';
    const avatarMode = bodyValidation.avatarMode;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    // Access check: caller must have access to the agent's starship
    const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res);
    if (!hasAccess) return;

    // Build engine config with modelRoutes so the remote runner can route the agent's model.
    const { engineConfig: engineConfigFromHost } = await buildAutopilotExecutionBundle({
      starshipId: agent.starshipId,
      authUserId: req.user!.id,
      runtimeEnv: { STARSHIP_ID: agent.starshipId },
    });

    // Avatar generator
    const generator = new AvatarGenerationService();

    // Special mode: migrate legacy 2D avatar to 3D using the existing avatar image as reference.
    if (mode === 'migrate_2d_to_3d') {
      if (!agent.avatarAttachmentId) {
        sendError(res, 'VALIDATION_ERROR', 'Agent has no existing avatar to migrate', 400);
        return;
      }

      // Resolve a presigned inline URL for the current avatar so the image model can fetch it.
      const attachmentService = new AttachmentService();
      const refs = await attachmentService.getAttachmentsBatch([agent.avatarAttachmentId], agent.starshipId);
      const refUrl = refs?.[0]?.previewUrl;
      if (!refUrl) {
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to resolve reference avatar URL', 500);
        return;
      }

      const gen = await generator.generateAvatar3DFromReference({
        subjectName: agent.name,
        subjectDescription: agent.description,
        starshipId: agent.starshipId,
        referenceImageUrl: refUrl,
        engineConfigFromHost: engineConfigFromHost as Record<string, unknown>,
      });

      // Store as attachment (auth-scoped)
      const filename = `agent-${agent.slug || agent.id}-avatar.${
        gen.mimeType.includes('webp') ? 'webp' : gen.mimeType.includes('png') ? 'png' : gen.mimeType.includes('jpeg') ? 'jpg' : 'img'
      }`;
      const attachment = await attachmentService.createAttachment({
        starshipId: agent.starshipId,
        conversationId: `agent-avatar-${agent.id}`,
        filename,
        mimeType: gen.mimeType,
        buffer: gen.buffer,
      });

      // Persist link on agent
      const updated = await agentService.updateAgent(agent.id, { avatarAttachmentId: attachment.id });

      sendSuccess(res, {
        agent: updated,
        attachment,
      });
      return;
    }

    // Ensure we have an agent-authored "mirror" description saved for this agent.
    let avatarPrompt = agent.avatarPrompt;
    if (mode === 'full_chain' || !avatarPrompt || avatarPrompt.trim().length === 0) {
      if (!agent.blueprint) {
        sendError(res, 'VALIDATION_ERROR', 'Agent blueprint is missing; cannot regenerate avatar prompt', 400);
        return;
      }
      if (!agent.model || typeof agent.model !== 'string' || agent.model.trim().length === 0) {
        sendError(res, 'VALIDATION_ERROR', 'Agent model is missing; cannot regenerate avatar prompt', 400);
        return;
      }
      const mirrorResult = await generator.generateMirrorDescription({
        agentName: agent.name,
        agentRole: agent.role,
        agentSystemPrompt: agent.systemPrompt,
        agentModel: agent.model,
        agentBlueprint: agent.blueprint,
        agentTools:
          agent.state && typeof agent.state === 'object' && Array.isArray((agent.state as { tools?: unknown }).tools)
            ? ((agent.state as { tools: unknown[] }).tools as unknown[])
            : [],
        starshipId: agent.starshipId,
        engineConfigFromHost: engineConfigFromHost as Record<string, unknown>,
      });
      avatarPrompt = mirrorResult.description;
      // Persist on agent for future avatar generations
      await agentService.updateAgent(agent.id, { avatarPrompt });
    }

    // Generate avatar via Autopilot runner/OpenRouter
    const gen = await generator.generateAvatar({
      subjectName: agent.name,
      subjectDescription: agent.description,
      subjectAvatarPrompt: avatarPrompt,
      starshipId: agent.starshipId,
      ...(avatarMode ? { avatarMode } : {}),
      engineConfigFromHost: engineConfigFromHost as Record<string, unknown>,
    });

    // Store as attachment (auth-scoped)
    const attachmentService = new AttachmentService();
    const filename = `agent-${agent.slug || agent.id}-avatar.${
      gen.mimeType.includes('webp') ? 'webp' : gen.mimeType.includes('png') ? 'png' : gen.mimeType.includes('jpeg') ? 'jpg' : 'img'
    }`;
    const attachment = await attachmentService.createAttachment({
      starshipId: agent.starshipId,
      conversationId: `agent-avatar-${agent.id}`,
      filename,
      mimeType: gen.mimeType,
      buffer: gen.buffer,
    });

    // Persist link on agent
    const updated = await agentService.updateAgent(agent.id, { avatarAttachmentId: attachment.id });

    sendSuccess(res, {
      agent: updated,
      attachment,
    });
  } catch (error) {
    handleError(error, res, 'generating agent avatar');
  }
});

/**
 * POST /agents/:id/avatar/upload/init
 * Initiate an avatar upload by returning a presigned PUT URL.
 */
router.post(
  '/agents/:id/avatar/upload/init',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
      if (!paramValidation) return;
      const { id: agentId } = paramValidation;

      const bodyValidation = validateData(
        z.object({
          filename: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(200),
          sizeBytes: z.number().int().min(1).max(MAX_FILE_SIZE),
        }),
        req.body,
        res,
        'avatar upload init body'
      );
      if (!bodyValidation) return;
      const { filename, mimeType, sizeBytes } = bodyValidation;

      if (!String(mimeType).startsWith('image/')) {
        sendError(res, 'VALIDATION_ERROR', 'Only image uploads are supported for avatars', 400);
        return;
      }

      if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
        sendError(res, 'VALIDATION_ERROR', `File type '${mimeType}' not allowed`, 400);
        return;
      }

      if (sizeBytes > MAX_FILE_SIZE) {
        sendError(res, 'VALIDATION_ERROR', `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`, 400);
        return;
      }

      const agentService = new AgentService();
      const agent = await agentService.getAgent(agentId);
      if (!agent) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
        return;
      }

      const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res);
      if (!hasAccess) return;

      sendSuccess(res, {
        upload: await generatePresignedUploadUrl({
          starshipId: agent.starshipId,
          conversationId: `agent-avatar-${agent.id}`,
          filename,
          mimeType,
          expiresIn: 60,
        }),
      });
    } catch (error) {
      handleError(error, res, 'initiating agent avatar upload');
    }
  }
);

/**
 * POST /agents/:id/avatar/upload/complete
 * Finalize an avatar upload by creating an attachment record referencing the uploaded S3 object
 * and setting avatarAttachmentId on the agent.
 */
router.post('/agents/:id/avatar/upload/complete', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;
    const { id: agentId } = paramValidation;

    const bodyValidation = validateData(
      z.object({
        s3Key: z.string().min(1).max(2048),
        filename: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(200),
        sizeBytes: z.number().int().min(1).max(MAX_FILE_SIZE),
      }),
      req.body,
      res,
      'avatar upload complete body'
    );
    if (!bodyValidation) return;

    const { s3Key, filename, mimeType, sizeBytes } = bodyValidation;

    if (!String(mimeType).startsWith('image/')) {
      sendError(res, 'VALIDATION_ERROR', 'Only image uploads are supported for avatars', 400);
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      sendError(res, 'VALIDATION_ERROR', `File type '${mimeType}' not allowed`, 400);
      return;
    }

    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res);
    if (!hasAccess) return;

    const expectedPrefix = `starship-${agent.starshipId}/conv-agent-avatar-${agent.id}/`;
    if (!String(s3Key).startsWith(expectedPrefix)) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid upload key', 400);
      return;
    }

    // Best-effort delete old avatar attachment to avoid orphaned files
    if (agent.avatarAttachmentId) {
      const attachmentService = new AttachmentService();
      try {
        await attachmentService.deleteAttachment(agent.avatarAttachmentId, agent.starshipId);
      } catch (e) {
        console.warn('[AGENT-AVATAR] Failed to delete previous avatar attachment:', e instanceof Error ? e.message : String(e));
      }
    }

    const attachmentService = new AttachmentService();
    const safeFilename = String(filename || 'avatar').replace(/[^\w.-]+/g, '_');
    const attachment = await attachmentService.createAttachmentReference({
      starshipId: agent.starshipId,
      filename: safeFilename.length > 0 ? safeFilename : `agent-${agent.slug || agent.id}-avatar`,
      mimeType,
      s3Key,
      sizeBytes,
    });

    const updated = await agentService.updateAgent(agent.id, { avatarAttachmentId: attachment.id });

    sendSuccess(res, { agent: updated, attachment });
  } catch (error) {
    handleError(error, res, 'completing agent avatar upload');
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

    const attachmentId = agent.avatarAttachmentId;
    if (attachmentId) {
      const attachmentService = new AttachmentService();
      try {
        await attachmentService.deleteAttachment(attachmentId, agent.starshipId);
      } catch (e) {
        // Non-fatal; proceed to detach
        console.warn('[AGENT-AVATAR] Failed to delete attachment:', e instanceof Error ? e.message : String(e));
      }
    }

    const updated = await agentService.updateAgent(agent.id, { avatarAttachmentId: undefined });

    sendSuccess(res, { agent: updated });
  } catch (error) {
    handleError(error, res, 'deleting agent avatar');
  }
});

/**
 * POST /agents/:id/profile-images/generate
 * Generates a profile image (Problem Statements, Capabilities, or Try These Prompts)
 * via OpenRouter image model and stores it as an attachment.
 */
router.post('/agents/:id/profile-images/generate', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;
    const { id: agentId } = paramValidation;

    const bodyValidation = validateData(
      z.object({
        type: z.enum(['problem_statements', 'capabilities', 'try_these_prompts']),
      }),
      (req.body ?? {}) as unknown,
      res,
      'profile image generation options'
    );
    if (!bodyValidation) return;
    const { type } = bodyValidation;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    // Access check: caller must have access to the agent's starship
    const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res);
    if (!hasAccess) return;

    // Require avatarPrompt for profile image generation
    if (!agent.avatarPrompt || agent.avatarPrompt.trim().length === 0) {
      sendError(
        res,
        'VALIDATION_ERROR',
        'Avatar prompt is required. Please generate an avatar first, or use "Reset & Generate" on the avatar.',
        400
      );
      return;
    }

    // Fetch tools to build core capabilities
    const tools = await agentService.getAgentTools(agentId, agent.starshipId);
    let coreCapabilities: string;
    if (tools.length > 0) {
      coreCapabilities = tools.map((t) => t.name || t.slug).join(', ');
    } else {
      // Fallback: use role + description
      const parts: string[] = [];
      if (agent.role) parts.push(agent.role);
      if (agent.description) {
        const desc = agent.description.length > 100 ? agent.description.slice(0, 100) + '...' : agent.description;
        parts.push(desc);
      }
      coreCapabilities = parts.join(' — ') || 'general assistance';
    }

    // Truncate if too long
    if (coreCapabilities.length > 200) {
      coreCapabilities = coreCapabilities.slice(0, 197) + '...';
    }

    // Build domain context
    let domainContext: string;
    if (agent.description) {
      const firstSentence = agent.description.split(/[.!?]/)[0].trim();
      if (firstSentence.length > 0 && firstSentence.length <= 100) {
        domainContext = firstSentence;
      } else {
        domainContext = agent.description.slice(0, 100).trim();
      }
    } else {
      domainContext = agent.role || 'general assistance';
    }

    // Build engine config with modelRoutes so the remote runner can route the image model.
    const { engineConfig: engineConfigFromHost } = await buildAutopilotExecutionBundle({
      starshipId: agent.starshipId,
      authUserId: req.user!.id,
      runtimeEnv: { STARSHIP_ID: agent.starshipId },
    });

    // Generate profile image
    const generator = new ProfileImageGenerationService();
    const gen = await generator.generateProfileImage(agent, type, {
      coreCapabilities,
      domainContext,
      engineConfigFromHost: engineConfigFromHost as Record<string, unknown>,
    });

    // Store as attachment (auth-scoped)
    const attachmentService = new AttachmentService();
    const typeSlug = type.replace(/_/g, '-');
    const filename = `agent-${agent.slug || agent.id}-${typeSlug}.${
      gen.mimeType.includes('webp') ? 'webp' : gen.mimeType.includes('png') ? 'png' : gen.mimeType.includes('jpeg') ? 'jpg' : 'img'
    }`;
    const attachment = await attachmentService.createAttachment({
      starshipId: agent.starshipId,
      conversationId: `agent-profile-${agent.id}-${type}`,
      filename,
      mimeType: gen.mimeType,
      buffer: gen.buffer,
    });

    // Map type to field name
    const fieldMap: Record<
      string,
      keyof Pick<AgentModel, 'problemStatementsAttachmentId' | 'capabilitiesAttachmentId' | 'tryThesePromptsAttachmentId'>
    > = {
      problem_statements: 'problemStatementsAttachmentId',
      capabilities: 'capabilitiesAttachmentId',
      try_these_prompts: 'tryThesePromptsAttachmentId',
    };

    const fieldName = fieldMap[type];
    if (!fieldName) {
      sendError(res, 'VALIDATION_ERROR', `Invalid type: ${type}`, 400);
      return;
    }

    // Persist link on agent
    const updated = await agentService.updateAgent(agent.id, { [fieldName]: attachment.id });

    sendSuccess(res, {
      agent: updated,
      attachment,
    });
  } catch (error) {
    handleError(error, res, 'generating profile image');
  }
});

/**
 * DELETE /agents/:id/profile-images/:type
 * Removes the stored profile image reference (and deletes the attachment).
 */
router.delete('/agents/:id/profile-images/:type', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
        type: z.enum(['problem_statements', 'capabilities', 'try_these_prompts']),
      }),
      req.params,
      res,
      'agent and type parameters'
    );
    if (!paramValidation) return;
    const { id: agentId, type } = paramValidation;

    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res);
    if (!hasAccess) return;

    // Map type to field name
    const fieldMap: Record<
      string,
      keyof Pick<AgentModel, 'problemStatementsAttachmentId' | 'capabilitiesAttachmentId' | 'tryThesePromptsAttachmentId'>
    > = {
      problem_statements: 'problemStatementsAttachmentId',
      capabilities: 'capabilitiesAttachmentId',
      try_these_prompts: 'tryThesePromptsAttachmentId',
    };

    const fieldName = fieldMap[type];
    if (!fieldName) {
      sendError(res, 'VALIDATION_ERROR', `Invalid type: ${type}`, 400);
      return;
    }

    const attachmentId = agent[fieldName];
    if (attachmentId) {
      const attachmentService = new AttachmentService();
      try {
        await attachmentService.deleteAttachment(attachmentId, agent.starshipId);
      } catch (e) {
        // Non-fatal; proceed to detach
        console.warn('[AGENT-PROFILE-IMAGE] Failed to delete attachment:', e instanceof Error ? e.message : String(e));
      }
    }

    const updated = await agentService.updateAgent(agent.id, { [fieldName]: undefined });

    sendSuccess(res, { agent: updated });
  } catch (error) {
    handleError(error, res, 'deleting profile image');
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

    const deleteToolsIfUnusedRaw = typeof req.query?.deleteToolsIfUnused === 'string' ? String(req.query.deleteToolsIfUnused) : '';
    const deleteToolsIfUnused = deleteToolsIfUnusedRaw === 'true' || deleteToolsIfUnusedRaw === '1';

    // Authorization: ensure caller owns the starship that owns this agent
    const agentService = new AgentService();
    const agent = await agentService.getAgent(paramValidation.id);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: paramValidation.id });
      return;
    }

    const hasAccess = await verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', paramValidation.id, res);
    if (!hasAccess) return;

    if (deleteToolsIfUnused) {
      const result = await agentService.deleteAgentAndUnusedTools(paramValidation.id);
      if (!result.deleted) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: paramValidation.id });
        return;
      }
      sendSuccess(
        res,
        { message: 'Agent deleted successfully', deletedToolIds: result.deletedToolIds },
        200
      );
      return;
    }

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

// PUT /agents/:id/tool-permissions - Upsert tool permissions for an agent (by tool slug)
router.put('/agents/:id/tool-permissions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'agent parameter');
    if (!paramValidation) return;

    const bodyValidation = validateData(ToolPermissionsUpdateSchema, req.body, res, 'tool permissions update');
    if (!bodyValidation) return;

    const { id: agentId } = paramValidation;
    const userId = req.user!.id;

    // Access check: caller must have access to the agent's starship
    const agentService = new AgentService();
    const agent = await agentService.getAgent(agentId);
    if (!agent) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404, { resource: 'agent', id: agentId });
      return;
    }

    const hasAccess = await verifyResourceAccess(agent.starshipId, userId, 'agent', agentId, res);
    if (!hasAccess) return;

    await agentService.setAgentToolPermissionsDerived(agentId, userId, bodyValidation.permissions);
    sendSuccess(res, { ok: true });
  } catch (error) {
    // Use shared error handler so ValidationErrors surface as 4xx (not 500).
    handleError(error, res, 'updating agent tool permissions');
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

export default router;
