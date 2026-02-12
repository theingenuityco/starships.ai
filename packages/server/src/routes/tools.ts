import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, PaginationSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { AgentRepository, ToolRepository, ToolTemplateRepository, StarshipRepository, UserRepository } from '@starships/models';
import { BalanceValidationService } from '@/services/BalanceValidationService';
import { WalletService } from '@/services/WalletService';
import { handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { ImportExportService } from '@/services/ImportExportService';
import { triggerNextRevalidate } from '@/utils/nextRevalidate';
import type {
  AuthUser,
  CreateToolRequest,
  CreateToolTemplateRequest,
  ToolTemplateModel,
  ToolModel,
  UpdateToolRequest,
  WalletModel,
} from '@starships/protocol';

const router: Router = Router();

type ConnectionLike = {
  query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
};

// Zod schemas for validation

const CreateToolSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must be less than 100 characters')
      .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
    description: z.string().min(0).max(320, 'Description must be less than or equal to 320 characters').optional().default(''),
    parameters: z
      .object({
        type: z.literal('object'),
        properties: z.record(z.string(), z.unknown()),
        required: z.array(z.string()).optional(),
      })
      .optional(),
    blueprint: z
      .object({
        nodes: z.array(z.unknown()),
        edges: z.array(z.unknown()),
      })
      .optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
    isEnabled: z.boolean().optional().default(true),
    status: z.enum(['draft', 'active']).optional().default('active'),
  })
  .refine(
    (data) => {
      // If either parameters or blueprint is provided, the other must also be provided
      if ((!!data.parameters && !data.blueprint) || (!data.parameters && !!data.blueprint)) {
        return false;
      }
      return true;
    },
    {
      message: 'Parameters and blueprint must both be provided together when setting either one',
      path: ['parameters'],
    }
  );

const PublishRequestSchema = z.object({
  versionBump: z.enum(['patch', 'minor', 'major']),
  changelog: z.string().min(1, 'Changelog is required').max(2000, 'Changelog must be at most 2000 characters'),
});

const CreateToolTemplateSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
  description: z.string().min(1, 'Description is required').max(4000, 'Description must be less than 4000 characters'),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }),
  blueprint: z.object({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
  }),
  category: z.enum(['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation']),
  exampleUsage: z
    .string()
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  requiresApiKey: z.boolean().optional(),
  configurationFields: z
    .array(
      z.object({
        name: z.string().refine(noXSS, { message: XSS_ERROR_MESSAGE }),
        type: z.enum(['string', 'number', 'boolean']),
        description: z.string(),
        required: z.boolean(),
      })
    )
    .optional(),
});

// Separate schema for updates without defaults to avoid overwriting unspecified fields
const UpdateToolSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .optional()
    .refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  description: z.string().min(0).max(320, 'Description must be less than or equal to 320 characters').optional(),
  parameters: z
    .object({
      type: z.literal('object'),
      properties: z.record(z.string(), z.unknown()),
      required: z.array(z.string()).optional(),
    })
    .optional(),
  blueprint: z
    .object({
      nodes: z.array(z.unknown()),
      edges: z.array(z.unknown()),
    })
    .optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
  status: z.enum(['draft', 'active']).optional(),
});

type WalletRequest = Request & { wallet?: WalletModel };

// Balance validation middleware for tool operations
const validateToolBalance = async (req: WalletRequest, res: Response, next: NextFunction) => {
  try {
    const { starshipId } = req.params;

    if (!starshipId) {
      sendError(res, 'VALIDATION_ERROR', 'Starship ID is required', 400);
      return;
    }

    const walletService = new WalletService();
    const wallet = await walletService.getByStarshipId(starshipId);

    if (!wallet) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Wallet not found', 404, {
        starshipId,
      });
      return;
    }

    // Validate balance using centralized service
    const balanceValidation = BalanceValidationService.validateBalance({
      id: wallet.id,
      balance: wallet.balance,
    });

    if (!balanceValidation.isValid) {
      const errorDetails = BalanceValidationService.getInsufficientBalanceError(wallet.balance);
      sendError(res, 'INSUFFICIENT_FUNDS', errorDetails.message, 402, errorDetails.details);
      return;
    }

    // Add wallet to request for use in route handlers
    req.wallet = wallet;
    next();
  } catch (error) {
    console.error('[TOOLS] Balance validation error:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Balance validation failed', 500);
  }
};

// ============================================================================
// TOOL TEMPLATE ENDPOINTS
// ============================================================================

// GET /tool-templates - List all tool templates (public)
router.get('/tool-templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const queryValidation = validateData(
      PaginationSchema.extend({
        category: z
          .enum(['general', 'coding', 'creative', 'analysis', 'support', 'utility', 'data', 'communication', 'automation'])
          .optional(),
        query: z.string().optional(),
        requiresApiKey: z.boolean().optional(),
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const toolTemplateRepository = new ToolTemplateRepository();
    const connection = ((toolTemplateRepository as any).getConnection?.() ?? null) as ConnectionLike | null;
    const windowDays = 30; // popularity window for listing (avoid `usage_count`)

    const page = queryValidation.page ?? 1;
    const limit = queryValidation.limit ?? 50;
    const offset = (page - 1) * limit;

    const q = String(queryValidation.query || '').trim();

    let templates: ToolTemplateModel[] = [];

    if (q) {
      // Search mode: keep deterministic created_at ordering from repository search.
      templates = await toolTemplateRepository.search({
        category: queryValidation.category,
        query: q,
        requiresApiKey: queryValidation.requiresApiKey,
      });
    } else if (!connection?.query) {
      templates = await toolTemplateRepository.search({
        category: queryValidation.category,
        query: undefined,
        requiresApiKey: queryValidation.requiresApiKey,
      });
    } else {
      const where: string[] = [];
      const params: unknown[] = [windowDays];
      let i = 2;

      if (queryValidation.category) {
        where.push(`tt.category = $${i}`);
        params.push(queryValidation.category);
        i++;
      }
      if (queryValidation.requiresApiKey !== undefined) {
        where.push(`tt.requires_api_key = $${i}`);
        params.push(queryValidation.requiresApiKey);
        i++;
      }

      params.push(limit);
      const pLimit = `$${i++}`;
      params.push(offset);
      const pOffset = `$${i++}`;

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const rows = await connection.query(
        `
          WITH tool_calls AS (
            SELECT
              (tc -> 'function' ->> 'name') AS tool_slug,
              m.conversation_id AS conversation_id
            FROM messages m
            JOIN LATERAL jsonb_array_elements(m.tool_calls) tc ON TRUE
            WHERE m.role = 'assistant'
              AND m.tool_calls IS NOT NULL
              AND jsonb_typeof(m.tool_calls) = 'array'
              AND m.created_at >= NOW() - ($1::int * INTERVAL '1 day')
          ),
          tool_usage AS (
            SELECT
              tool_slug,
              COUNT(*)::int AS call_count,
              COUNT(DISTINCT conversation_id)::int AS conversation_count
            FROM tool_calls
            WHERE tool_slug IS NOT NULL AND tool_slug <> ''
            GROUP BY tool_slug
          ),
          tool_tokens AS (
            SELECT
              tc.tool_slug AS tool_slug,
              COALESCE(SUM(u.total_tokens), 0)::bigint AS token_count
            FROM (SELECT DISTINCT tool_slug, conversation_id FROM tool_calls WHERE tool_slug IS NOT NULL AND tool_slug <> '') tc
            JOIN usage u ON u.conversation_id = tc.conversation_id
            WHERE u.created_at >= NOW() - ($1::int * INTERVAL '1 day')
            GROUP BY tc.tool_slug
          )
          SELECT tt.*
          FROM tool_templates tt
          LEFT JOIN tool_usage tu ON tu.tool_slug = tt.slug
          LEFT JOIN tool_tokens tok ON tok.tool_slug = tt.slug
          ${whereSql}
          ORDER BY
            COALESCE(tu.conversation_count, 0) DESC,
            COALESCE(tok.token_count, 0) DESC,
            COALESCE(tu.call_count, 0) DESC,
            tt.created_at DESC
          LIMIT ${pLimit}
          OFFSET ${pOffset}
        `,
        params
      );

      // Reuse repository entity mapping to keep API shape consistent.
      // `search()` already maps DB->model for us; mimic by using `fromDatabaseArray` is internal to repo,
      // so instead call findById for the ordered ids (bounded by limit).
      const ids = (rows || [])
        .map((r: Record<string, unknown>) => (typeof r?.id === 'string' ? String(r.id).trim() : ''))
        .filter((x: string) => x.length > 0);
      const fetched = await Promise.all(ids.map((id: string) => toolTemplateRepository.findById(id)));
      templates = fetched.filter((t): t is ToolTemplateModel => !!t);
    }

    // Public template routes should not expose executable blueprints
    const sanitized = templates.map((t) => {
      const rest: Record<string, unknown> = { ...((t ?? {}) as unknown as Record<string, unknown>) };
      delete rest['blueprint'];
      return rest;
    });

    sendSuccess(res, sanitized);
  } catch (error) {
    console.error('[TOOLS] Error fetching tool templates:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch tool templates');
  }
});

// GET /tool-templates/:slug - Get specific tool template (public)
router.get('/tool-templates/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ slug: SlugSchema }), req.params, res, 'template slug parameter');
    if (!paramValidation) return;

    const toolTemplateRepository = new ToolTemplateRepository();
    const template = await toolTemplateRepository.findBySlug(paramValidation.slug);

    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool template not found', 404);
      return;
    }

    // Public template routes should not expose executable blueprints
    const rest: Record<string, unknown> = { ...((template ?? {}) as unknown as Record<string, unknown>) };
    delete rest['blueprint'];
    sendSuccess(res, rest);
  } catch (error) {
    console.error('[TOOLS] Error getting tool template:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get tool template');
  }
});

// POST /tool-templates - Create new tool template (OpenAPI pattern)
router.post('/tool-templates', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const bodyValidation = validateData(CreateToolTemplateSchema, req.body, res, 'tool template creation data');
    if (!bodyValidation) return;

    const toolTemplateRepository = new ToolTemplateRepository();
    const template = await toolTemplateRepository.create(bodyValidation as unknown as CreateToolTemplateRequest);

    console.log(`[TOOLS] Tool template created successfully: ${template.slug}`);
    // Do not return executable blueprints in template responses
    const rest: Record<string, unknown> = { ...((template ?? {}) as unknown as Record<string, unknown>) };
    delete rest['blueprint'];
    sendSuccess(res, rest, 201);
  } catch (error) {
    console.error('[TOOLS] Error creating tool template:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create tool template');
  }
});

// ============================================================================
// TOOL INSTANCE ENDPOINTS
// ============================================================================

/**
 * GET /tools/:id/export
 * Export a tool as a JSON container (instance admin only).
 */
router.get('/tools/:id/export', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
      sendError(res, 'FORBIDDEN', 'Only instance admins can export tools', 403);
      return;
    }

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'tool parameter');
    if (!paramValidation) return;

    const svc = new ImportExportService();
    const container = await svc.exportTool(paramValidation.id);
    sendSuccess(res, container);
  } catch (error) {
    console.error('[TOOLS] Error exporting tool:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to export tool');
  }
});

// GET /starships/:starshipId/tools - Get tools for a starship (OpenAPI pattern)
router.get('/starships/:starshipId/tools', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const hasAccess = await verifyStarshipAccess(paramValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const toolRepository = new ToolRepository();
    const tools = await toolRepository.findByStarship(paramValidation.starshipId);

    sendSuccess(res, tools);
  } catch (error) {
    console.error('[TOOLS] Error fetching starship tools:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship tools');
  }
});

// GET /starships/:starshipId/starship-tool-permissions - Get starship-level tool permission rows
router.get('/starships/:starshipId/starship-tool-permissions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const hasAccess = await verifyStarshipAccess(paramValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const repo = new AgentRepository();
    const rows = await repo.getStarshipToolPermissions(paramValidation.starshipId);
    sendSuccess(res, rows);
  } catch (error) {
    console.error('[TOOLS] Error fetching starship tool permissions:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to fetch starship tool permissions');
  }
});

// PUT /starships/:starshipId/starship-tool-permissions - Upsert starship-level tool permissions by slug
router.put('/starships/:starshipId/starship-tool-permissions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const hasAccess = await verifyStarshipAccess(paramValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const bodyValidation = validateData(
      z.object({
        permissions: z.array(
          z.object({
            toolSlug: z.string().min(1),
            permission: z.enum(['allow', 'ask', 'deny']),
          })
        ),
      }),
      req.body,
      res,
      'starship tool permissions payload'
    );
    if (!bodyValidation) return;

    const repo = new AgentRepository();
    for (const p of bodyValidation.permissions) {
      if (!p?.toolSlug) continue;
      await repo.setStarshipToolPermissionBySlug({
        starshipId: paramValidation.starshipId,
        toolSlug: p.toolSlug,
        permission: p.permission,
      });
    }

    sendSuccess(res, { ok: true });
  } catch (error) {
    console.error('[TOOLS] Error updating starship tool permissions:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update starship tool permissions');
  }
});

// DELETE /starships/:starshipId/starship-tool-permissions/:toolSlug - Remove a starship-level tool permission mapping
router.delete(
  '/starships/:starshipId/starship-tool-permissions/:toolSlug',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(
        z.object({
          starshipId: IdSchema,
          toolSlug: SlugSchema,
        }),
        req.params,
        res,
        'starship tool permission parameters'
      );
      if (!paramValidation) return;

      const userId = req.user?.id as string | undefined;
      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const hasAccess = await verifyStarshipAccess(paramValidation.starshipId, userId, res);
      if (!hasAccess) return;

      const repo = new AgentRepository();
      await repo.removeStarshipToolPermissionBySlug({ starshipId: paramValidation.starshipId, toolSlug: paramValidation.toolSlug });
      sendSuccess(res, { ok: true });
    } catch (error) {
      console.error('[TOOLS] Error removing starship tool permission mapping:', error);
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to remove starship tool permission mapping');
    }
  }
);

// GET /starships/:starshipId/tools/:slug - Get specific tool for a starship (OpenAPI pattern)
router.get('/starships/:starshipId/tools/:slug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(
      z.object({
        starshipId: IdSchema,
        slug: SlugSchema,
      }),
      req.params,
      res,
      'starship and tool parameters'
    );
    if (!paramValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const hasAccess = await verifyStarshipAccess(paramValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const { starshipId, slug } = paramValidation;
    const toolRepository = new ToolRepository();
    const tool = await toolRepository.findBySlugAndStarship(slug, starshipId);

    if (!tool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404);
      return;
    }

    sendSuccess(res, tool);
  } catch (error) {
    console.error('[TOOLS] Error getting tool:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to get tool');
  }
});

// POST /starships/:starshipId/tools - Create tool instance for starship (OpenAPI pattern)
router.post('/starships/:starshipId/tools', jwtAuthMiddleware, validateToolBalance, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const hasAccess = await verifyStarshipAccess(paramValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const bodyValidation = validateData(CreateToolSchema, req.body, res, 'tool creation data');
    if (!bodyValidation) return;

    const { starshipId } = paramValidation;
    const toolRepository = new ToolRepository();
    const tool = await toolRepository.create(
      {
        ...bodyValidation,
        transforms: undefined,
        mutations: undefined,
        condition: undefined,
      } as unknown as CreateToolRequest,
      starshipId
    );

    console.log(`[TOOLS] Tool created successfully: ${tool.slug} for starship ${starshipId}`);
    sendSuccess(res, tool, 201);
  } catch (error) {
    handleError(error, res, 'create tool', 'Failed to create tool');
  }
});

// POST /starships/:starshipId/tools/from-template - Create tool from template (OpenAPI pattern)
router.post(
  '/starships/:starshipId/tools/from-template',
  jwtAuthMiddleware,
  validateToolBalance,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
      if (!paramValidation) return;

      const userId = req.user?.id as string | undefined;
      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const hasAccess = await verifyStarshipAccess(paramValidation.starshipId, userId, res);
      if (!hasAccess) return;

      const bodyValidation = validateData(
        z.object({
          templateSlug: z.string().min(1, 'Template slug is required'),
          configuration: z.record(z.string(), z.unknown()).optional(),
        }),
        req.body,
        res,
        'template creation data'
      );
      if (!bodyValidation) return;

      const { starshipId } = paramValidation;
      const { templateSlug, configuration } = bodyValidation;

      const toolRepository = new ToolRepository();
      const tool = await toolRepository.createFromTemplate(templateSlug, starshipId, configuration);

      console.log(`[TOOLS] Tool created from template ${templateSlug} for starship ${starshipId}: ${tool.slug}`);
      sendSuccess(res, tool, 201);
    } catch (error) {
      console.error('[TOOLS] Error creating tool from template:', error);
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create tool from template');
    }
  }
);

// PUT /tools/:id - Update tool (OpenAPI pattern)
router.put('/tools/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'tool parameter');
    if (!paramValidation) return;

    const bodyValidation = validateData(UpdateToolSchema, req.body, res, 'tool update data');
    if (!bodyValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const toolRepository = new ToolRepository();
    const existingTool = await toolRepository.findById(paramValidation.id);

    if (!existingTool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404);
      return;
    }

    const hasAccess = await verifyResourceAccess(existingTool.starshipId, userId, 'tool', paramValidation.id, res);
    if (!hasAccess) return;

    const tool = await toolRepository.update(paramValidation.id, bodyValidation as unknown as UpdateToolRequest);

    if (!tool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404);
      return;
    }

    sendSuccess(res, tool);
  } catch (error) {
    handleError(error, res, 'update tool', 'Failed to update tool');
  }
});

// DELETE /tools/:id - Delete tool (OpenAPI pattern)
router.delete('/tools/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'tool parameter');
    if (!paramValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const toolRepository = new ToolRepository();
    const existingTool = await toolRepository.findById(paramValidation.id);

    if (!existingTool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404);
      return;
    }

    const hasAccess = await verifyResourceAccess(existingTool.starshipId, userId, 'tool', paramValidation.id, res);
    if (!hasAccess) return;

    const deleted = await toolRepository.delete(paramValidation.id);

    if (!deleted) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404);
      return;
    }

    sendSuccess(res, { message: 'Tool deleted successfully' });
  } catch (error) {
    console.error('[TOOLS] Error deleting tool:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete tool');
  }
});

// ============================================================================
// TEMPLATE VERSIONING & UPDATE ROUTES
// ============================================================================

/**
 * POST /tools/:id/update-from-template - Update tool with latest template data
 */
router.post('/tools/:id/update-from-template', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(
      z.object({
        id: IdSchema,
      }),
      req.params,
      res,
      'tool ID'
    );
    if (!paramValidation) return;

    const { id: toolId } = paramValidation;
    const userId = req.user!.id;

    // Authorization: verify caller owns the tool
    const toolRepository = new ToolRepository();
    const tool = await toolRepository.findById(toolId);
    if (!tool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404, { resource: 'tool', id: toolId });
      return;
    }

    const hasAccess = await verifyResourceAccess(tool.starshipId, userId, 'tool', toolId, res);
    if (!hasAccess) return;

    const updated = await toolRepository.updateFromTemplate(toolId);

    // Return minimal response - only essential fields
    sendSuccess(res, {
      id: updated.id,
      name: updated.name,
      version: updated.version,
      templateSnapshotAt: updated.templateSnapshotAt,
      updatedAt: updated.updatedAt,
      message: 'Tool updated successfully from template',
    });
  } catch (error) {
    console.error('[TOOLS] Error updating from template:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update tool from template');
  }
});

// ============================================================================
// TOOL PUBLICATION WORKFLOW (INSTANCE ADMIN REVIEW)
// ============================================================================

/**
 * POST /tools/:id/publish-request - Request publication (owner or instance admin)
 */
router.post('/tools/:id/publish-request', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'tool parameter');
    if (!paramValidation) return;

    const { id: toolId } = paramValidation;
    const userId = req.user!.id;

    // Validate publish request body (version bump + changelog)
    const bodyValidation = validateData(PublishRequestSchema, req.body, res, 'publish request data');
    if (!bodyValidation) return;

    const toolRepository = new ToolRepository();
    const tool = await toolRepository.findById(toolId);
    if (!tool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404, { resource: 'tool', id: toolId });
      return;
    }

    // Ensure caller owns the tool's starship or is instance admin
    const hasAccess = await verifyResourceAccess(tool.starshipId, userId, 'tool', toolId, res);
    if (!hasAccess) return;

    if (tool.publicationStatus === 'pending_approval') {
      sendError(res, 'VALIDATION_ERROR', 'Tool is already pending approval', 400);
      return;
    }

    // Determine requested version based on current version and bump type
    const currentVersion = tool.version || '1.0.0';
    const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
    let requestedVersion = currentVersion;

    if (match) {
      const major = Number(match[1]);
      const minor = Number(match[2]);
      const patch = Number(match[3]);

      switch (bodyValidation.versionBump) {
        case 'patch':
          requestedVersion = `${major}.${minor}.${patch + 1}`;
          break;
        case 'minor':
          requestedVersion = `${major}.${minor + 1}.0`;
          break;
        case 'major':
          requestedVersion = `${major + 1}.0.0`;
          break;
      }
    } else {
      requestedVersion = '1.0.0';
    }

    const updated = await toolRepository.requestPublicationAtomic(toolId, {
      publicationStatus: 'pending_approval',
      publicationRequestedBy: userId,
      publicationVersionBump: bodyValidation.versionBump,
      publicationRequestedVersion: requestedVersion,
      publicationChangelog: bodyValidation.changelog,
    });

    sendSuccess(res, {
      message: 'Tool publication requested successfully',
      tool: updated,
    });
  } catch (error) {
    console.error('[TOOLS] Error requesting tool publication:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to request tool publication');
  }
});

// ADMIN PUBLICATION APPROVAL ROUTES (INSTANCE ADMIN ONLY)

// GET /admin/tools/pending - List tools pending approval
router.get('/admin/tools/pending', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
      sendError(res, 'FORBIDDEN', 'Only instance admins can view pending tools', 403);
      return;
    }

    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    const toolRepository = new ToolRepository();
    const tools = await toolRepository.findAll();
    const pendingTools = tools.filter((tool) => tool.publicationStatus === 'pending_approval');
    const total = pendingTools.length;
    const offset = (queryValidation.page - 1) * queryValidation.limit;
    const paginatedTools = pendingTools.slice(offset, offset + queryValidation.limit);

    // Enrich with user display name and starship label for admin UX,
    // while keeping publicationRequestedBy as the underlying user id.
    const userRepo = new UserRepository();
    const starshipRepo = new StarshipRepository();

    const enrichedTools: Array<{
      tool: ToolModel;
      requestedBy?: {
        id: string;
        name?: string;
        avatar?: string;
      };
      requestedByStarship?: {
        id: string;
        name?: string;
        slug?: string;
      };
    }> = [];

    for (const tool of paginatedTools) {
      let requestedBy:
        | {
            id: string;
            name?: string;
            avatar?: string;
          }
        | undefined;
      let requestedByStarship:
        | {
            id: string;
            name?: string;
            slug?: string;
          }
        | undefined;

      try {
        if (tool.publicationRequestedBy) {
          const [user, starship] = await Promise.all([
            userRepo.findById(tool.publicationRequestedBy as string),
            starshipRepo.findById(tool.starshipId),
          ]);

          if (user) {
            requestedBy = {
              id: user.id,
              name: user.displayName || user.email || user.id,
              avatar: user.avatar,
            };
          } else {
            requestedBy = {
              id: tool.publicationRequestedBy,
            };
          }

          if (starship) {
            requestedByStarship = {
              id: starship.id,
              name: starship.name || starship.slug,
              slug: starship.slug,
            };
          }
        }
      } catch {
        if (tool.publicationRequestedBy) {
          requestedBy = { id: tool.publicationRequestedBy };
        }
      }

      enrichedTools.push({
        tool,
        requestedBy,
        requestedByStarship,
      });
    }

    sendSuccess(res, enrichedTools, 200, {
      pagination: {
        page: queryValidation.page,
        limit: queryValidation.limit,
        total,
        has_next: offset + queryValidation.limit < total,
        has_prev: queryValidation.page > 1,
      },
    });
  } catch (error) {
    console.error('[TOOLS] Error loading pending tools:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to load pending tools');
  }
});

// POST /admin/tools/:id/approve - Approve pending tool publication
router.post('/admin/tools/:id/approve', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
      sendError(res, 'FORBIDDEN', 'Only instance admins can approve tools', 403);
      return;
    }

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'tool parameter');
    if (!paramValidation) return;

    const { id: toolId } = paramValidation;
    const adminUserId = req.user!.id;

    const toolRepository = new ToolRepository();
    const templateRepository = new ToolTemplateRepository();

    const tool = await toolRepository.findById(toolId);
    if (!tool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404, { resource: 'tool', id: toolId });
      return;
    }

    if (tool.publicationStatus !== 'pending_approval') {
      sendError(res, 'VALIDATION_ERROR', 'Tool is not pending approval', 400);
      return;
    }

    // Determine next version:
    // - Prefer owner-requested version from publish-request flow
    // - Fallback to simple minor bump for backwards compatibility
    const currentVersion = tool.version || '1.0.0';
    let nextVersion = tool.publicationRequestedVersion;

    if (!nextVersion) {
      const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
      nextVersion = match != null ? `${match[1]}.${Number(match[2]) + 1}.0` : '1.0.0';
    }

    // Determine target template (publishedTemplateId or new template)
    let targetTemplateId = tool.publishedTemplateId;

    if (targetTemplateId) {
      const existingTemplate = await templateRepository.findById(targetTemplateId);
      if (!existingTemplate) {
        // If the referenced template no longer exists, drop the link and create a new one
        targetTemplateId = undefined;
      }
    }

    if (!targetTemplateId) {
      // Create a new template from this tool
      const createdTemplate = await templateRepository.create({
        name: tool.name,
        description: tool.description,
        category: 'utility',
        parameters: tool.parameters!,
        blueprint: tool.blueprint!,
        transforms: tool.transforms,
        mutations: tool.mutations,
        condition: tool.condition,
        version: nextVersion,
      } satisfies CreateToolTemplateRequest);

      targetTemplateId = createdTemplate.id;
    } else {
      // Update existing template from this tool
      await templateRepository.update(targetTemplateId, {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        blueprint: tool.blueprint,
        transforms: tool.transforms,
        mutations: tool.mutations,
        condition: tool.condition,
        version: nextVersion,
      });
    }

    // Persist publication metadata on tool
    const updated = await toolRepository.update(toolId, {
      version: nextVersion,
      publishedTemplateId: targetTemplateId,
      publicationStatus: 'published',
      publicationApprovedBy: adminUserId,
      publicationApprovedAt: new Date().toISOString(),
    } satisfies UpdateToolRequest);

    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404, { resource: 'tool', id: toolId });
      return;
    }

    // Refresh marketing/marketplace ISR immediately (keep SEO, avoid staleness).
    triggerNextRevalidate({ tags: ['public-tool-templates'] });

    sendSuccess(res, {
      message: 'Tool publication approved',
      tool: updated,
    });
  } catch (error) {
    console.error('[TOOLS] Error approving tool publication:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to approve tool publication');
  }
});

// POST /admin/tools/:id/reject - Reject pending tool publication
router.post('/admin/tools/:id/reject', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isInstanceAdmin(req.user as AuthUser | null | undefined)) {
      sendError(res, 'FORBIDDEN', 'Only instance admins can reject tools', 403);
      return;
    }

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'tool parameter');
    if (!paramValidation) return;

    const { id: toolId } = paramValidation;
    const adminUserId = req.user!.id;

    const toolRepository = new ToolRepository();
    const tool = await toolRepository.findById(toolId);
    if (!tool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404, { resource: 'tool', id: toolId });
      return;
    }

    if (tool.publicationStatus !== 'pending_approval') {
      sendError(res, 'VALIDATION_ERROR', 'Tool is not pending approval', 400);
      return;
    }

    const updated = await toolRepository.update(toolId, {
      publicationStatus: 'rejected',
      publicationApprovedBy: adminUserId,
      publicationApprovedAt: new Date().toISOString(),
    } satisfies UpdateToolRequest);

    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404, { resource: 'tool', id: toolId });
      return;
    }

    sendSuccess(res, {
      message: 'Tool publication rejected',
      tool: updated,
    });
  } catch (error) {
    console.error('[TOOLS] Error rejecting tool publication:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to reject tool publication');
  }
});

export default router;
