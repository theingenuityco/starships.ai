import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { ConnectorService } from '@/services/ConnectorService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import type {
  ConnectorCatalogResponse,
  ConnectorListResponse,
  ConnectWithApiKeyRequest,
  StartOAuthRequest,
  StartOAuthResponse,
} from '@starships/protocol';
import { IdSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { getEnvConfig } from '@starships/env';

const env = getEnvConfig();

const router: Router = Router();

const ApiKeyConnectSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  extraConfig: z.record(z.unknown()).optional(),
});

const ProviderParamSchema = z.object({
  id: IdSchema,
  provider: z.enum(['linkedin', 'discord']),
});

// GET /connectors/catalog - Static connector catalog
router.get('/connectors/catalog', async (_req: Request, res: Response): Promise<void> => {
  try {
    const connectorService = new ConnectorService();
    const catalog = connectorService.getConnectorCatalog();
    const response: ConnectorCatalogResponse = {
      connectors: catalog,
    };
    sendSuccess(res, response);
  } catch (error) {
    handleError(error, res, 'fetching connector catalog');
  }
});

// GET /starships/:id/connectors - List connectors for a starship
router.get('/starships/:id/connectors', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: starshipId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const paramValidation = validateData(z.object({ id: IdSchema }), req.params, res, 'starship parameter');
    if (!paramValidation) return;

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const connectorService = new ConnectorService();
    const connectors = await connectorService.listStarshipConnectors(starshipId);

    const response: ConnectorListResponse = {
      starshipId,
      connectors,
    };

    sendSuccess(res, response);
  } catch (error) {
    handleError(error, res, 'fetching starship connectors');
  }
});

// POST /starships/:id/connectors/:provider/api-key - Connect via API key (e.g., Discord)
router.post(
  '/starships/:id/connectors/:provider/api-key',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const paramsValidation = validateData(
        ProviderParamSchema,
        { id: req.params.id, provider: req.params.provider },
        res,
        'connector parameters',
      );
      if (!paramsValidation) return;

      const { id: starshipId, provider } = paramsValidation;

      if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

      const bodyValidation = validateData(
        ApiKeyConnectSchema,
        req.body as ConnectWithApiKeyRequest,
        res,
        'API key connector payload',
      );
      if (!bodyValidation) return;

      const connectorService = new ConnectorService();
      const connector = await connectorService.connectWithApiKey(
        starshipId,
        provider,
        bodyValidation as ConnectWithApiKeyRequest,
        userId,
      );

      sendSuccess(res, { connector });
    } catch (error) {
      handleError(error, res, 'connecting connector via API key');
    }
  },
);

// POST /starships/:id/connectors/:provider/disconnect - Disconnect connector
router.post(
  '/starships/:id/connectors/:provider/disconnect',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const paramsValidation = validateData(
        ProviderParamSchema,
        { id: req.params.id, provider: req.params.provider },
        res,
        'connector parameters',
      );
      if (!paramsValidation) return;

      const { id: starshipId, provider } = paramsValidation;

      if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

      const connectorService = new ConnectorService();
      const disconnected = await connectorService.disconnect(starshipId, provider);

      if (!disconnected) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Connector not found for this starship', 404, {
          starshipId,
          provider,
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      handleError(error, res, 'disconnecting connector');
    }
  },
);

// POST /starships/:id/connectors/:provider/oauth/start - Start OAuth flow (e.g., LinkedIn)
router.post(
  '/starships/:id/connectors/:provider/oauth/start',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const paramsValidation = validateData(
        ProviderParamSchema,
        { id: req.params.id, provider: req.params.provider },
        res,
        'connector parameters',
      );
      if (!paramsValidation) return;

      const { id: starshipId, provider } = paramsValidation;

      if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

      if (provider !== 'linkedin') {
        sendError(res, 'NOT_IMPLEMENTED', 'OAuth start is only supported for LinkedIn at this time', 501);
        return;
      }

      const connectorService = new ConnectorService();
      const _body = req.body as StartOAuthRequest | undefined;

      const authorizationUrl = await connectorService.startLinkedInOAuth(starshipId, userId);

      const response: StartOAuthResponse = {
        authorizationUrl,
      };

      sendSuccess(res, response);
    } catch (error) {
      handleError(error, res, 'starting OAuth connector flow');
    }
  },
);

const OAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
});

// GET /connectors/:provider/oauth/callback - OAuth callback for connectors (LinkedIn)
router.get('/connectors/:provider/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramsValidation = validateData(
      z.object({ provider: z.enum(['linkedin']) }),
      req.params,
      res,
      'connector OAuth provider',
    );
    if (!paramsValidation) return;

    const { provider } = paramsValidation;

    const queryValidation = validateData(OAuthCallbackSchema, req.query, res, 'connector OAuth callback');
    if (!queryValidation) return;

    const { code, state, error } = queryValidation;

    if (error) {
      const redirectParams = new URLSearchParams({
        connector: provider,
        status: 'error',
      });
      const redirectUrl = `${env.PUBLIC_URL}/connectors/callback?${redirectParams.toString()}`;
      res.redirect(redirectUrl);
      return;
    }

    const connectorService = new ConnectorService();
    const { starshipId, starshipSlug } = await connectorService.completeLinkedInOAuth(code, state);

    const redirectParams = new URLSearchParams({
      connector: provider,
      status: 'success',
      starshipId,
    });

    const slugOrId = starshipSlug || starshipId;
    const redirectUrl = `${env.PUBLIC_URL}/ship/${slugOrId}/settings/environment?${redirectParams.toString()}`;

    res.redirect(redirectUrl);
  } catch (error) {
    // On error, redirect back with a generic failure state
    const redirectParams = new URLSearchParams({
      connector: 'linkedin',
      status: 'error',
    });
    const redirectUrl = `${env.PUBLIC_URL}/connectors/callback?${redirectParams.toString()}`;
    res.redirect(redirectUrl);
  }
});

export default router;


