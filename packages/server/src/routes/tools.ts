import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, PaginationSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { ToolRepository, ToolTemplateRepository } from '@starships/models';
import { BalanceValidationService } from '@/services/BalanceValidationService';
import { WalletService } from '@/services/WalletService';
import { sendError, sendSuccess } from '../utils/responseHelpers';
import { verifyStarshipAccess, verifyResourceAccess } from '@/middleware/verify-starship-access';

const router: Router = Router();

// Zod schemas for validation

const CreateToolSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').refine(noXSS, { message: XSS_ERROR_MESSAGE }),
    description: z.string().min(0).max(4000, 'Description must be less than 4000 characters').optional().default(''),
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

const CreateToolTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').refine(noXSS, { message: XSS_ERROR_MESSAGE }),
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
  exampleUsage: z.string().optional().refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
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
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').optional().refine((val) => !val || noXSS(val), { message: XSS_ERROR_MESSAGE }),
  description: z.string().min(0).max(4000, 'Description must be less than 4000 characters').optional(),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be less than 100 characters').optional(),
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

// Balance validation middleware for tool operations
const validateToolBalance = async (req: Request, res: Response, next: any) => {
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
    (req as any).wallet = wallet;
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
    const templates = await toolTemplateRepository.search({
      category: queryValidation.category,
      query: queryValidation.query,
      requiresApiKey: queryValidation.requiresApiKey,
    });

    sendSuccess(res, templates);
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

    sendSuccess(res, template);
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
    const template = await toolTemplateRepository.create(bodyValidation as any);

    console.log(`[TOOLS] Tool template created successfully: ${template.slug}`);
    sendSuccess(res, template, 201);
  } catch (error) {
    console.error('[TOOLS] Error creating tool template:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create tool template');
  }
});

// ============================================================================
// TOOL INSTANCE ENDPOINTS
// ============================================================================

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
      } as any,
      starshipId
    );

    console.log(`[TOOLS] Tool created successfully: ${tool.slug} for starship ${starshipId}`);
    sendSuccess(res, tool, 201);
  } catch (error) {
    console.error('[TOOLS] Error creating tool:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to create tool');
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

    const tool = await toolRepository.update(paramValidation.id, bodyValidation as any);

    if (!tool) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Tool not found', 404);
      return;
    }

    sendSuccess(res, tool);
  } catch (error) {
    console.error('[TOOLS] Error updating tool:', error);
    sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to update tool');
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

export default router;
