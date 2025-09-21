import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';
import { ToolRepository, ToolTemplateRepository } from '@starships/models';
import { sendError, sendSuccess } from '../utils/responseHelpers';

const router: Router = Router();

// Zod schemas for validation
const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
const SlugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-_]+$/, 'Invalid slug format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CreateToolSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().min(1, 'Description is required').max(500, 'Description must be less than 500 characters'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be less than 100 characters'),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }),
  blueprint: z.object({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
  }),
  configuration: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional().default(true),
});

const CreateToolTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().min(1, 'Description is required').max(500, 'Description must be less than 500 characters'),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
  }),
  blueprint: z.object({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
  }),
  category: z.enum(['general', 'api', 'utility', 'data', 'communication', 'automation']),
  exampleUsage: z.string().optional(),
  requiresApiKey: z.boolean().optional(),
  configurationFields: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['string', 'number', 'boolean']),
        description: z.string(),
        required: z.boolean(),
      })
    )
    .optional(),
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

// ============================================================================
// TOOL TEMPLATE ENDPOINTS
// ============================================================================

// GET /tool-templates - List all tool templates (OpenAPI pattern)
router.get('/tool-templates', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const queryValidation = validateData(
      PaginationSchema.extend({
        category: z.enum(['general', 'api', 'utility', 'data', 'communication', 'automation']).optional(),
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

// GET /tool-templates/:slug - Get specific tool template (OpenAPI pattern)
router.get('/tool-templates/:slug', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
router.post('/starships/:starshipId/tools', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

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
router.post('/starships/:starshipId/tools/from-template', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

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
});

// PUT /tools/:id - Update tool (OpenAPI pattern)
router.put('/tools/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'tool parameter');
    if (!paramValidation) return;

    const bodyValidation = validateData(CreateToolSchema.partial(), req.body, res, 'tool update data');
    if (!bodyValidation) return;

    const toolRepository = new ToolRepository();
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

    const toolRepository = new ToolRepository();
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
