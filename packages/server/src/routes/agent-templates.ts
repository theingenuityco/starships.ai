import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { AgentTemplateService } from '@/services/AgentTemplateService';
import { getConnection } from '@starships/models';
import { Request, Response, Router } from 'express';
import { z, ZodError } from 'zod';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '../utils/responseHelpers';

const router: Router = Router();

// Zod schemas for validation
const IdSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CreateAgentFromTemplateSchema = z.object({
  agentName: z
    .string()
    .min(1, 'Agent name is required and must be a non-empty string')
    .max(255, 'Agent name must be less than 255 characters'),
  starshipId: z
    .string()
    .regex(/^([a-z0-9]{10,30}|[a-z0-9-]{1,100})$/i, 'Invalid starship ID or slug')
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

// Helper function to get AgentTemplateService instance
function getAgentTemplateService(): AgentTemplateService | null {
  try {
    const connection = getConnection();
    return new AgentTemplateService(connection);
  } catch (error) {
    console.error('Failed to get AgentTemplateService:', error);
    return null;
  }
}

// GET /agent-templates - Get all templates (OpenAPI pattern)
router.get('/agent-templates', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Template service not available', 503);
      return;
    }

    // Validate pagination parameters
    const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination query');
    if (!queryValidation) return;

    const { page, limit } = queryValidation;

    const allTemplates = await templateService.getAllTemplates();

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedTemplates = allTemplates.slice(startIndex, startIndex + limit);

    const paginationMeta = createPaginationMeta(page, limit, paginatedTemplates.length);

    sendSuccess(res, paginatedTemplates, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'loading templates');
  }
});

// GET /agent-templates/:id - Get template by ID (OpenAPI pattern)
router.get('/agent-templates/:id', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate template ID format
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;

    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Template service not available', 503);
      return;
    }

    const template = await templateService.getTemplateById(id);

    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template not found', 404, {
        resource: 'agent-template',
        id: id,
      });
      return;
    }

    sendSuccess(res, template, 200);
  } catch (error) {
    handleError(error, res, 'loading template');
  }
});

// POST /agent-templates/:templateId/agents - Create agent from template (OpenAPI pattern)
router.post('/agent-templates/:templateId/agents', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    // Validate templateId format
    const paramValidation = validateData(z.object({ templateId: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;

    // Validate request body using the schema
    const bodyValidation = validateData(CreateAgentFromTemplateSchema, req.body, res, 'request body');
    if (!bodyValidation) return;

    const { agentName, starshipId } = bodyValidation;

    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Template service not available', 503);
      return;
    }

    // Check if template exists first
    const template = await templateService.getTemplateById(templateId);
    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template not found', 404, {
        resource: 'agent-template',
        id: templateId,
      });
      return;
    }

    // Determine the target starship ID
    let targetStarshipId = starshipId;

    // If no starshipId provided, get user's first active starship as fallback
    if (!targetStarshipId) {
      try {
        const activeStarship = await templateService.findUserActiveStarship(userId);

        if (!activeStarship) {
          sendError(res, 'VALIDATION_ERROR', 'No starship specified and no active starships found', 400, {
            details: 'Please provide a starshipId or create an active starship first',
          });
          return;
        }

        targetStarshipId = activeStarship.id;
        console.log(`[TEMPLATE] Using fallback starship "${activeStarship.name}" (${targetStarshipId}) for agent creation`);
      } catch (starshipError) {
        console.error('[TEMPLATE] Error finding user starships:', starshipError);
        sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to determine target starship', 500, {
          details: 'Could not retrieve user starships to create agent',
        });
        return;
      }
    } else {
      // Validate provided starshipId exists and belongs to user using service layer
      try {
        const starship = await templateService.validateStarshipAccess(targetStarshipId, userId);
        console.log(`[TEMPLATE] Using specified starship "${starship.name}" (${targetStarshipId}) for agent creation`);
      } catch (starshipError: any) {
        console.error('[TEMPLATE] Error validating starship access:', {
          starshipId: targetStarshipId,
          userId,
          errorName: starshipError?.name,
          errorMessage: starshipError?.message,
          fullError: starshipError,
        });

        if (starshipError?.name === 'NotFoundError') {
          sendError(res, 'RESOURCE_NOT_FOUND', starshipError.message || 'Starship not found', 404, {
            resource: 'starship',
            id: targetStarshipId,
            hint: 'Please ensure you have access to a starship before creating agents',
          });
        } else if (starshipError?.name === 'ValidationError') {
          sendError(res, 'ACCESS_DENIED', 'Access denied to this starship', 403, {
            details: 'You do not have permission to create agents on this starship',
          });
        } else {
          sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to validate starship', 500, {
            details: 'Could not verify starship ownership and existence',
          });
        }
        return;
      }
    }

    // Create agent from template with validated starship ID
    const agent = await templateService.createAgentFromTemplate(templateId, agentName.trim(), userId, targetStarshipId);

    // Log the creation for audit purposes
    console.log(
      `[TEMPLATE] Agent "${agent.name}" created from template "${template.name}" by user ${userId} on starship ${targetStarshipId}`
    );

    sendSuccess(res, agent, 201);
  } catch (error) {
    handleError(error, res, 'creating agent from template');
  }
});

export default router;
