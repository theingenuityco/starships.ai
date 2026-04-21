import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { AgentRepository, ToolRepository } from '@starships/models';
import { BalanceValidationService } from '@/services/BalanceValidationService';
import { WalletService } from '@/services/WalletService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';
import { isInstanceAdmin } from '@/utils/auth-helpers';
import { ImportExportService } from '@/services/ImportExportService';
import type {
  AuthUser,
  CreateToolRequest,
  UpdateToolRequest,
  WalletModel,
} from '@starships/protocol';

const router: Router = Router();

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

    // Optional pagination/search for clients that want server-driven pagination.
    // Back-compat: if no `page` and no `limit` are provided, return the full list as before.
    const queryValidation = validateData(
      z.object({
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        search: z.string().optional(),
        order: z.enum(['ASC', 'DESC']).optional(),
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const userId = req.user?.id as string | undefined;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const hasAccess = await verifyStarshipAccess(paramValidation.starshipId, userId, res);
    if (!hasAccess) return;

    const toolRepository = new ToolRepository();
    const tools = await toolRepository.findByStarship(paramValidation.starshipId);

    const wantsPagination = queryValidation.page !== undefined || queryValidation.limit !== undefined || (queryValidation.search ?? '').trim().length > 0;
    if (!wantsPagination) {
      sendSuccess(res, tools);
      return;
    }

    const page = Number.isFinite(queryValidation.page as any) ? Math.max(1, Math.floor(Number(queryValidation.page))) : 1;
    const limit = Number.isFinite(queryValidation.limit as any) ? Math.max(1, Math.floor(Number(queryValidation.limit))) : 50;
    const offset = (page - 1) * limit;
    const q = String(queryValidation.search || '').trim().toLowerCase();
    const order = queryValidation.order ?? 'DESC';

    const filtered = q
      ? (tools || []).filter((t: any) => {
          const name = String(t?.name || '').toLowerCase();
          const slug = String(t?.slug || '').toLowerCase();
          const desc = String(t?.description || '').toLowerCase();
          return name.includes(q) || slug.includes(q) || desc.includes(q);
        })
      : tools || [];

    // Sort tools by most recently updated (or created), then by name for stability.
    const sorted = [...filtered].sort((a: any, b: any) => {
      const aTsRaw = (a?.updatedAt || a?.createdAt) as unknown;
      const bTsRaw = (b?.updatedAt || b?.createdAt) as unknown;
      const aTs = typeof aTsRaw === 'string' ? new Date(aTsRaw).getTime() : 0;
      const bTs = typeof bTsRaw === 'string' ? new Date(bTsRaw).getTime() : 0;
      if (aTs !== bTs) return order === 'ASC' ? aTs - bTs : bTs - aTs;
      const aName = String(a?.name || a?.slug || '');
      const bName = String(b?.name || b?.slug || '');
      return aName.localeCompare(bName);
    });

    const total = sorted.length;
    const pageItems = sorted.slice(offset, offset + limit);
    sendSuccess(res, pageItems, 200, createPaginationMeta(page, limit, total));
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

export default router;
