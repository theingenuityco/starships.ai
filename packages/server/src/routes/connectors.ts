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
  extraConfig: z.record(z.string(), z.unknown()).optional(),
});

const GitHubAppConfigSchema = z.object({
  installationId: z.string().min(1, 'installationId is required'),
  defaultOwner: z.string().optional(),
  defaultRepo: z.string().optional(),
});

const ProviderParamSchema = z.object({
  id: IdSchema,
  provider: z.enum(['linkedin', 'discord', 'google_drive']),
});

// GET /connectors/catalog - Static connector catalog
router.get('/connectors/catalog', async (req: Request, res: Response): Promise<void> => {
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

// POST /starships/:id/connectors/:provider/api-key - Connect via API key
router.post('/starships/:id/connectors/:provider/api-key', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
      'connector parameters'
    );
    if (!paramsValidation) return;

    const { id: starshipId, provider } = paramsValidation;

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const bodyValidation = validateData(ApiKeyConnectSchema, req.body as ConnectWithApiKeyRequest, res, 'API key connector payload');
    if (!bodyValidation) return;

    if (provider === 'discord') {
      sendError(res, 'OPERATION_NOT_ALLOWED', 'Discord connector no longer supports API key flow; use OAuth instead.', 400, {
        provider,
      });
      return;
    }

    const connectorService = new ConnectorService();
    const connector = await connectorService.connectWithApiKey(starshipId, provider, bodyValidation as ConnectWithApiKeyRequest, userId);

    sendSuccess(res, { connector });
  } catch (error) {
    handleError(error, res, 'connecting connector via API key');
  }
});

// POST /starships/:id/connectors/github/app-config - Configure GitHub App connector per starship
router.post(
  '/starships/:id/connectors/github/app-config',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
        return;
      }

      const paramsValidation = validateData(
        z.object({ id: IdSchema }),
        { id: req.params.id },
        res,
        'starship parameter',
      );
      if (!paramsValidation) return;

      const { id: starshipId } = paramsValidation;

      if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

      const bodyValidation = validateData(
        GitHubAppConfigSchema,
        req.body as unknown,
        res,
        'GitHub App connector configuration',
      );
      if (!bodyValidation) return;

      const connectorService = new ConnectorService();
      await connectorService.configureGitHubConnector(starshipId, userId, bodyValidation);

      res.status(204).send();
    } catch (error) {
      handleError(error, res, 'configuring GitHub connector');
    }
  },
);

// POST /starships/:id/connectors/:provider/disconnect - Disconnect connector
router.post('/starships/:id/connectors/:provider/disconnect', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
      'connector parameters'
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
});

// POST /starships/:id/connectors/:provider/oauth/start - Start OAuth flow (LinkedIn, Discord, Google Drive)
router.post('/starships/:id/connectors/:provider/oauth/start', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
      'connector parameters'
    );
    if (!paramsValidation) return;

    const { id: starshipId, provider } = paramsValidation;

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const connectorService = new ConnectorService();
    const _body = req.body as StartOAuthRequest | undefined;

    let authorizationUrl: string;
    if (provider === 'linkedin') {
      authorizationUrl = await connectorService.startLinkedInOAuth(starshipId, userId);
    } else if (provider === 'discord') {
      authorizationUrl = await connectorService.startDiscordOAuth(starshipId, userId);
    } else if (provider === 'google_drive') {
      authorizationUrl = await connectorService.startGoogleDriveOAuth(starshipId, userId);
    } else {
      sendError(res, 'OPERATION_NOT_ALLOWED', 'OAuth start is not supported for this provider', 400, {
        provider,
      });
      return;
    }

    const response: StartOAuthResponse = {
      authorizationUrl,
    };

    sendSuccess(res, response);
  } catch (error) {
    handleError(error, res, 'starting OAuth connector flow');
  }
});

const OAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required').optional(),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
});

// GET /connectors/:provider/oauth/callback - OAuth callback for connectors (LinkedIn, Discord, Google Drive)
router.get('/connectors/:provider/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramsValidation = validateData(
      z.object({ provider: z.enum(['linkedin', 'discord', 'google_drive']) }),
      req.params,
      res,
      'connector OAuth provider'
    );
    if (!paramsValidation) return;

    const { provider } = paramsValidation;

    const queryValidation = validateData(OAuthCallbackSchema, req.query, res, 'connector OAuth callback');
    if (!queryValidation) return;

    const { code, state, error } = queryValidation;

    if (error || !code) {
      const redirectParams = new URLSearchParams({
        connector: provider,
        status: 'error',
      });
      const redirectUrl = `${env.PUBLIC_URL}/connectors/callback?${redirectParams.toString()}`;
      res.redirect(redirectUrl);
      return;
    }

    const connectorService = new ConnectorService();
    let starshipId: string;
    let starshipSlug: string | undefined;

    if (provider === 'linkedin') {
      const result = await connectorService.completeLinkedInOAuth(code, state);
      starshipId = result.starshipId;
      starshipSlug = result.starshipSlug;
    } else if (provider === 'discord') {
      const result = await connectorService.completeDiscordOAuth(code, state, {
        guild_id: typeof (req.query as any).guild_id === 'string' ? ((req.query as any).guild_id as string) : undefined,
        permissions: typeof (req.query as any).permissions === 'string' ? ((req.query as any).permissions as string) : undefined,
      });
      starshipId = result.starshipId;
      starshipSlug = result.starshipSlug;
    } else if (provider === 'google_drive') {
      const result = await connectorService.completeGoogleDriveOAuth(code, state);
      starshipId = result.starshipId;
      starshipSlug = result.starshipSlug;
    } else {
      const redirectParams = new URLSearchParams({
        connector: provider,
        status: 'error',
      });
      const redirectUrl = `${env.PUBLIC_URL}/connectors/callback?${redirectParams.toString()}`;
      res.redirect(redirectUrl);
      return;
    }

    const redirectParams = new URLSearchParams({
      connector: provider,
      status: 'success',
    });

    const basePath =
      starshipSlug !== undefined && starshipSlug.length > 0
        ? `/ship/${encodeURIComponent(starshipSlug)}/connectors`
        : `/ship/${encodeURIComponent(starshipId)}/connectors`;

    const redirectUrl = `${env.PUBLIC_URL}${basePath}?${redirectParams.toString()}`;

    res.redirect(redirectUrl);
  } catch (error) {
    // On error, redirect back with a generic failure state
    const redirectParams = new URLSearchParams({
      connector: (req.params as any).provider || 'linkedin',
      status: 'error',
    });
    const redirectUrl = `${env.PUBLIC_URL}/connectors/callback?${redirectParams.toString()}`;
    res.redirect(redirectUrl);
  }
});

export default router;
