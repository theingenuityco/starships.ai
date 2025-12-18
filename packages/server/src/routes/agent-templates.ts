import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { AgentTemplateService } from '@/services/AgentTemplateService';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { validateData } from '@/utils/validation';
import { IdSchema, PaginationSchema } from '@/schemas/common';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '../utils/responseHelpers';
import { AgentTemplateRepository } from '@starships/models';
import { generatePresignedUrlInline } from '@/utils/s3-helper';

const router: Router = Router();

// Zod schemas for validation
// Using standard pagination schema for consistency

const CreateAgentFromTemplateSchema = z.object({
  starshipId: z.string().regex(/^([a-z0-9_-]{10,30}|[a-z0-9-]{1,100})$/i, 'Invalid starship ID or slug'),
});

// Helper function to get AgentTemplateService instance
function getAgentTemplateService(): AgentTemplateService | null {
  try {
    return new AgentTemplateService();
  } catch (error) {
    console.error('Failed to get AgentTemplateService:', error);
    return null;
  }
}

// GET /agent-templates - Get all templates (public)
router.get('/agent-templates', async (req: Request, res: Response): Promise<void> => {
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

// GET /agent-templates/:id - Get template by ID (public)
router.get('/agent-templates/:id', async (req: Request, res: Response): Promise<void> => {
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

/**
 * GET /agent-templates/:id/avatar (public)
 * Streams the template avatar from S3 via a server-generated presigned URL.
 */
router.get('/agent-templates/:id/avatar', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'template parameter');
    if (!paramValidation) return;
    const { id } = paramValidation;

    const repo = new AgentTemplateRepository();
    const storage = await repo.getAvatarStorageById(id);
    if (!storage || !storage.avatarS3Key) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Template avatar not found', 404, { resource: 'agent-template-avatar', id });
      return;
    }

    const url = await generatePresignedUrlInline(storage.avatarS3Key, 60);
    const response = await fetch(url);
    if (!response.ok) {
      sendError(res, 'SERVICE_UNAVAILABLE', 'Failed to fetch template avatar from storage', 500);
      return;
    }

    res.setHeader('Content-Type', storage.avatarMimeType || response.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (storage.avatarUpdatedAt) {
      res.setHeader('Last-Modified', new Date(storage.avatarUpdatedAt).toUTCString());
    }

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const buf = await response.arrayBuffer();
      res.send(Buffer.from(buf));
    }
  } catch (error) {
    handleError(error, res, 'fetching template avatar');
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

    const { starshipId } = bodyValidation;

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

    // Validate provided starshipId exists and belongs to user using service layer
    try {
      const starship = await templateService.validateStarshipAccess(starshipId, userId);
      console.log(`[TEMPLATE] Using specified starship "${starship.name}" (${starshipId}) for agent creation`);
    } catch (starshipError: any) {
      console.error('[TEMPLATE] Error validating starship access:', {
        starshipId: starshipId,
        errorName: starshipError?.name,
        errorMessage: starshipError?.message,
        fullError: starshipError,
      });

      if (starshipError?.name === 'NotFoundError') {
        sendError(res, 'RESOURCE_NOT_FOUND', starshipError.message || 'Starship not found', 404, {
          resource: 'starship',
          id: starshipId,
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

    // Create agent from template with validated starship ID
    const agent = await templateService.createAgentFromTemplate(templateId, starshipId);

    // Log the creation for audit purposes
    console.log(`[TEMPLATE] Agent "${agent.name}" created from template "${template.name}" by user ${userId} on starship ${starshipId}`);

    sendSuccess(res, agent, 201);
  } catch (error) {
    handleError(error, res, 'creating agent from template');
  }
});

export default router;
