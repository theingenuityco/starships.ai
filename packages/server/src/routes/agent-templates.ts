import { Router } from 'express';
import { RepositoryFactory } from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import { Request, Response } from 'express';
import { getConnection } from '@starships/models';
import { AgentTemplateService } from '../services/AgentTemplateService';
import {
  sendSuccess,
  sendError,
  handleCommonError,
  validateUUID,
  validatePagination,
  createPaginationMeta,
} from '../utils/responseHelpers';

const router: Router = Router();

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
router.get('/agent-templates', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, "SERVICE_UNAVAILABLE", 'Template service not available', 503);
      return;
    }

    // Parse and validate pagination parameters
    const pagination = validatePagination(req.query.page as string, req.query.limit as string);
    if (pagination.error) {
      sendError(res, pagination.error.code, pagination.error.message, 400);
      return;
    }

    const allTemplates = await templateService.getAllTemplates();
    
    // Apply pagination
    const startIndex = (pagination.page - 1) * pagination.limit;
    const paginatedTemplates = allTemplates.slice(startIndex, startIndex + pagination.limit);

    const paginationMeta = createPaginationMeta(pagination.page, pagination.limit, paginatedTemplates.length);

    sendSuccess(res, paginatedTemplates, 200, paginationMeta);

  } catch (error) {
    if (!handleCommonError(error, res, 'loading templates')) {
      sendError(res, "INTERNAL_SERVER_ERROR", 'Failed to load templates');
    }
  }
});

// GET /agent-templates/:id - Get template by ID (OpenAPI pattern)
router.get('/agent-templates/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate template ID format
    const { isValid, error } = validateUUID(id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, "SERVICE_UNAVAILABLE", 'Template service not available', 503);
      return;
    }

    const template = await templateService.getTemplateById(id);

    if (!template) {
      sendError(res, "RESOURCE_NOT_FOUND", 'Template not found', 404, {
        resource: 'agent-template',
        id: id
      });
      return;
    }

    sendSuccess(res, template, 200);

  } catch (error) {
    if (!handleCommonError(error, res, 'loading template')) {
      sendError(res, "INTERNAL_SERVER_ERROR", 'Failed to load template');
    }
  }
});

// POST /agent-templates/:templateId/agents - Create agent from template (OpenAPI pattern)
router.post('/agent-templates/:templateId/agents', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateId } = req.params;
    const { agentName, starshipId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, "AUTHENTICATION_REQUIRED", 'User not authenticated', 401);
      return;
    }

    // Validate templateId format
    const { isValid, error } = validateUUID(templateId, 'templateId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    // Validate required fields
    if (!agentName || typeof agentName !== 'string' || !agentName.trim()) {
      sendError(res, "MISSING_REQUIRED_FIELD", 'agentName is required and must be a non-empty string', 400, {
        field: 'agentName',
        provided: typeof agentName,
      });
      return;
    }

    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, "SERVICE_UNAVAILABLE", 'Template service not available', 503);
      return;
    }

    // Check if template exists first
    const template = await templateService.getTemplateById(templateId);
    if (!template) {
      sendError(res, "RESOURCE_NOT_FOUND", 'Template not found', 404, {
        resource: 'agent-template',
        id: templateId
      });
      return;
    }

    // Determine the target starship ID
    let targetStarshipId = starshipId;

    // If no starshipId provided, get user's first active starship as fallback
    if (!targetStarshipId) {
      try {
        const starshipRepository = await RepositoryFactory.getStarshipRepository();
        const userStarships = await starshipRepository.findByOwner(userId);

        // Find the first active starship
        const activeStarship = userStarships.find((ship) => ship.status === 'active');

        if (!activeStarship) {
          sendError(res, "VALIDATION_ERROR", 'No starship specified and no active starships found', 400, {
            details: 'Please provide a starshipId or create an active starship first'
          });
          return;
        }

        targetStarshipId = activeStarship.id;
        console.log(
          `[TEMPLATE] Using fallback starship "${activeStarship.name}" (${targetStarshipId}) for agent creation`
        );
      } catch (starshipError) {
        console.error('[TEMPLATE] Error finding user starships:', starshipError);
        sendError(res, "INTERNAL_SERVER_ERROR", 'Failed to determine target starship', 500, {
          details: 'Could not retrieve user starships to create agent'
        });
        return;
      }
    } else {
      // Validate starshipId format
      const starshipValidation = validateUUID(targetStarshipId, 'starshipId');
      if (!starshipValidation.isValid && starshipValidation.error) {
        sendError(res, starshipValidation.error.code, starshipValidation.error.message, 400, starshipValidation.error.details);
        return;
      }

      // Validate provided starshipId exists and belongs to user
      try {
        const starshipRepository = await RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepository.findById(targetStarshipId);

        if (!starship) {
          sendError(res, "RESOURCE_NOT_FOUND", 'Starship not found', 404, {
            resource: 'starship',
            id: targetStarshipId
          });
          return;
        }

        if (starship.ownerId !== userId) {
          sendError(res, "ACCESS_DENIED", 'Access denied to this starship', 403, {
            details: 'You do not have permission to create agents on this starship'
          });
          return;
        }

        console.log(
          `[TEMPLATE] Using specified starship "${starship.name}" (${targetStarshipId}) for agent creation`
        );
      } catch (starshipError) {
        console.error('[TEMPLATE] Error validating starship:', starshipError);
        sendError(res, "INTERNAL_SERVER_ERROR", 'Failed to validate starship', 500, {
          details: 'Could not verify starship ownership and existence'
        });
        return;
      }
    }

    // Create agent from template with validated starship ID
    const agent = await templateService.createAgentFromTemplate(
      templateId,
      agentName.trim(),
      userId,
      targetStarshipId
    );

    // Log the creation for audit purposes
    console.log(
      `[TEMPLATE] Agent "${agent.name}" created from template "${template.name}" by user ${userId} on starship ${targetStarshipId}`
    );

    sendSuccess(res, agent, 201);

  } catch (error) {
    if (!handleCommonError(error, res, 'creating agent from template')) {
      sendError(res, "INTERNAL_SERVER_ERROR", 'Failed to create agent from template');
    }
  }
});

// POST /agent-templates/from-agents/:agentId - Convert a public agent to a template (OpenAPI pattern)
router.post('/agent-templates/from-agents/:agentId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[TEMPLATE] Convert agent to template request received:', req.params);
    const { agentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, "AUTHENTICATION_REQUIRED", 'User not authenticated', 401);
      return;
    }

    // Validate agentId format
    const { isValid, error } = validateUUID(agentId, 'agentId');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    console.log('[TEMPLATE] Getting template service...');
    const templateService = getAgentTemplateService();
    if (!templateService) {
      sendError(res, "SERVICE_UNAVAILABLE", 'Template service not available', 503);
      return;
    }

    // Check if agent exists and is public
    console.log('[TEMPLATE] Getting agent repository...');
    const agentRepository = RepositoryFactory.getAgentRepository();
    console.log('[TEMPLATE] Finding agent by ID:', agentId);
    const agent = await agentRepository.findById(agentId);

    if (!agent) {
      console.log('[TEMPLATE] Error: Agent not found:', agentId);
      sendError(res, "RESOURCE_NOT_FOUND", 'Agent not found', 404, {
        resource: 'agent',
        id: agentId
      });
      return;
    }

    console.log('[TEMPLATE] Agent found:', agent.id, agent.name, 'isPublic:', agent.isPublic);

    if (!agent.isPublic) {
      console.log('[TEMPLATE] Error: Agent is not public');
      sendError(res, "VALIDATION_ERROR", 'Only public agents can be converted to templates', 400, {
        field: 'isPublic',
        constraint: 'must_be_public',
        provided: agent.isPublic
      });
      return;
    }

    // Check if user is the author of the agent
    console.log('[TEMPLATE] Checking author:', agent.authorId, 'vs user:', userId);
    if (agent.authorId !== userId) {
      console.log('[TEMPLATE] Error: User is not the author of the agent');
      sendError(res, "ACCESS_DENIED", 'Access denied', 403, {
        details: 'You can only convert your own agents to templates'
      });
      return;
    }

    // Create template from agent using any type to bypass TypeScript error
    console.log('[TEMPLATE] Creating template from agent using type assertion...');
    const template = await (templateService as any).createTemplateFromAgent(agentId);

    if (!template) {
      console.log('[TEMPLATE] Error: Failed to create template');
      sendError(res, "INTERNAL_SERVER_ERROR", 'Failed to convert agent to template');
      return;
    }

    // Log the conversion for audit purposes
    console.log(`[TEMPLATE] Agent "${agent.name}" converted to template by user ${userId}`);
    console.log('[TEMPLATE] Template created:', template.id, template.name);

    sendSuccess(res, template, 201);

  } catch (error) {
    console.error('Error converting agent to template:', error);
    if (!handleCommonError(error, res, 'converting agent to template')) {
      sendError(res, "INTERNAL_SERVER_ERROR", 'Failed to convert agent to template', 500, {
        details: String(error)
      });
    }
  }
});

export default router;
