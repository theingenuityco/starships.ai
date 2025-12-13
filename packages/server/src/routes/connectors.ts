import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { ConnectorService } from '@/services/ConnectorService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import type { ConnectorCatalogResponse, ConnectorListResponse, ConnectWithApiKeyRequest, StartOAuthResponse } from '@starships/protocol';
import { IdSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { getEnvConfig } from '@starships/env';
import { validateOAuthState } from '@/utils/jwt';
import type { ConnectorProvider } from '@starships/protocol';

const env = getEnvConfig();

const router: Router = Router();

interface OAuthStateContext {
  starshipId?: string;
  provider?: string;
}

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
  provider: z.string().min(1, 'provider is required'),
});

// GET /connectors/catalog - Static connector catalog
router.get('/connectors/catalog', async (req: Request, res: Response): Promise<void> => {
  try {
    const connectorService = new ConnectorService();
    const catalog = await connectorService.getConnectorCatalog();
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
    const userId = req.user?.id;

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
      connectors,
    };

    sendSuccess(res, response);
  } catch (error) {
    handleError(error, res, 'fetching starship connectors');
  }
});

// POST /starships/:id/connectors/:provider/refresh - Refresh connector via blueprint (if configured)
router.post('/starships/:id/connectors/:provider/refresh', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
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
    const connector = await connectorService.refreshConnector(starshipId, provider);

    if (!connector) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector or refresh blueprint not found for this starship', 404, {
        starshipId,
        provider,
      });
      return;
    }

    sendSuccess(res, { connector });
  } catch (error) {
    handleError(error, res, 'refreshing connector via blueprint');
  }
});

// POST /starships/:id/connectors/:provider/test - Test connector via blueprint (if configured)
router.post('/starships/:id/connectors/:provider/test', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
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
    const result = await connectorService.testConnector(starshipId, provider as ConnectorProvider);

    if (!result) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector or test blueprint not found for this starship', 404, {
        starshipId,
        provider,
      });
      return;
    }

    sendSuccess(res, result);
  } catch (error) {
    handleError(error, res, 'testing connector via blueprint');
  }
});

// POST /starships/:id/connectors/:provider/api-key - Connect via API key
router.post('/starships/:id/connectors/:provider/api-key', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
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
router.post('/starships/:id/connectors/github/app-config', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }

    const paramsValidation = validateData(z.object({ id: IdSchema }), { id: req.params.id }, res, 'starship parameter');
    if (!paramsValidation) return;

    const { id: starshipId } = paramsValidation;

    if (!(await verifyStarshipAccess(starshipId, userId, res))) return;

    const bodyValidation = validateData(GitHubAppConfigSchema, req.body as unknown, res, 'GitHub App connector configuration');
    if (!bodyValidation) return;

    const connectorService = new ConnectorService();
    await connectorService.configureGitHubConnector(starshipId, userId, bodyValidation);

    res.status(204).send();
  } catch (error) {
    handleError(error, res, 'configuring GitHub connector');
  }
});

// POST /starships/:id/connectors/:provider/disconnect - Disconnect connector
router.post('/starships/:id/connectors/:provider/disconnect', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
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

// Shared handler to start a connector flow (OAuth2 or provider-specific like GitHub App).
async function startConnectorHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
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

    const authorizationUrl = await connectorService.startConnector(starshipId, userId, provider as ConnectorProvider);

    const response: StartOAuthResponse = {
      authorizationUrl,
    };

    sendSuccess(res, response);
  } catch (error) {
    handleError(error, res, 'starting connector flow');
  }
}

// POST /starships/:id/connectors/:provider/start - Generic connector start route
router.post('/starships/:id/connectors/:provider/start', jwtAuthMiddleware, startConnectorHandler);

const OAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required').optional(),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
});

// Shared handler for connector callbacks (OAuth2 and provider-specific flows like GitHub App).
async function connectorCallbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramsValidation = validateData(
      z.object({ provider: z.string().min(1, 'provider is required') }),
      req.params,
      res,
      'connector OAuth provider'
    );
    if (!paramsValidation) return;

    const { provider } = paramsValidation;

    const queryValidation = validateData(OAuthCallbackSchema, req.query, res, 'connector OAuth callback');
    if (!queryValidation) return;

    const { code, state, error } = queryValidation;

    const connectorService = new ConnectorService();

    const buildStarshipRedirect = (starshipId: string, starshipSlug: string | undefined, params: URLSearchParams): string => {
      const basePath =
        starshipSlug !== undefined && starshipSlug.length > 0
          ? `/ship/${encodeURIComponent(starshipSlug)}/connectors`
          : `/ship/${encodeURIComponent(starshipId)}/connectors`;
      return `${env.PUBLIC_URL}${basePath}?${params.toString()}`;
    };

    // Custom connectors like GitHub App: delegate completion to a
    // provider-specific connect blueprint via completeCustomConnector.
    if (provider === 'github') {
      try {
        const { starshipId, starshipSlug } = await connectorService.completeCustomConnector(
          provider as ConnectorProvider,
          state,
          req.query as Record<string, unknown>
        );

        const redirectParams = new URLSearchParams({
          connector: provider,
          status: 'success',
        });

        const redirectUrl = buildStarshipRedirect(starshipId, starshipSlug, redirectParams);
        res.redirect(redirectUrl);
        return;
      } catch {
        // Fall through to generic error handling below.
      }
    }

    if (error || !code) {
      try {
        const stateValidation = await validateOAuthState(state);
        if (stateValidation.valid) {
          const ctx = stateValidation.context as OAuthStateContext | undefined;
          const starshipId = ctx?.starshipId as string | undefined;
          const providerFromState = ctx?.provider as string | undefined;

          if (starshipId) {
            const redirectParams = new URLSearchParams({
              connector: providerFromState || provider,
              status: 'error',
            });
            const redirectUrl = buildStarshipRedirect(starshipId, undefined, redirectParams);
            res.redirect(redirectUrl);
            return;
          }
        }
      } catch {
        // fall through to generic callback redirect below
      }

      const redirectParams = new URLSearchParams({
        connector: provider,
        status: 'error',
      });
      const redirectUrl = `${env.PUBLIC_URL}/?${redirectParams.toString()}`;
      res.redirect(redirectUrl);
      return;
    }

    const { starshipId, starshipSlug } = await connectorService.completeOAuthConnector(
      provider as ConnectorProvider,
      code,
      state,
      req.query as Record<string, unknown>
    );

    const redirectParams = new URLSearchParams({
      connector: provider,
      status: 'success',
    });

    const redirectUrl = buildStarshipRedirect(starshipId, starshipSlug, redirectParams);

    res.redirect(redirectUrl);
  } catch {
    // On error, try to redirect back to the starship connectors page with an error flag
    try {
      const provider = req.params.provider as string | undefined;
      const rawState = req.query.state as string | undefined;

      if (rawState) {
        const stateValidation = await validateOAuthState(rawState);
        if (stateValidation.valid) {
          const ctx = stateValidation.context as OAuthStateContext | undefined;
          const starshipId = ctx?.starshipId as string | undefined;
          const redirectParams = new URLSearchParams({
            connector: provider || ctx?.provider || 'unknown',
            status: 'error',
          });

          if (starshipId) {
            const basePath = `/ship/${encodeURIComponent(starshipId)}/connectors`;
            const redirectUrl = `${env.PUBLIC_URL}${basePath}?${redirectParams.toString()}`;
            res.redirect(redirectUrl);
            return;
          }
        }
      }
    } catch {
      // ignore and fall back to generic callback redirect
    }

    const redirectParams = new URLSearchParams({
      connector: req.params.provider || 'linkedin',
      status: 'error',
    });
    const redirectUrl = `${env.PUBLIC_URL}/?${redirectParams.toString()}`;
    res.redirect(redirectUrl);
  }
}

// GET /connectors/:provider/callback - Generic connector callback route
router.get('/connectors/:provider/callback', connectorCallbackHandler);

export default router;
