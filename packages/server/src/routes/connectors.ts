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

    const connectorService = new ConnectorService();
    const connector = await connectorService.connectWithApiKey(starshipId, provider, bodyValidation as ConnectWithApiKeyRequest, userId);

    sendSuccess(res, { connector });
  } catch (error) {
    handleError(error, res, 'connecting connector via API key');
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

function redactOAuthCallbackQueryForLogs(query: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(query)) {
    if (key === 'code' || key === 'state') {
      redacted[key] = '[REDACTED]';
      continue;
    }
    redacted[key] = val;
  }
  return redacted;
}

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

    // Custom connectors (authType = 'custom', e.g. GitHub App) delegate
    // completion to a provider-specific connect blueprint via
    // completeCustomConnector. The service method inspects the connector
    // template's authType, so we don't hard-code provider ids here.
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
    } catch (customError) {
      const msg = (customError as Error | undefined)?.message || '';
      // Expected path for non-custom connectors: completeCustomConnector throws when authType !== 'custom'.
      // Avoid noisy logs; just fall through to the OAuth2 handler below.
      if (!msg.includes('does not use custom authentication')) {
        console.error('[CONNECTOR_CALLBACK] Custom connector completion failed; falling back to oauth2', {
          provider,
          errorMessage: msg,
          errorName: (customError as Error | undefined)?.name,
        });
      }
      // Fall through to generic OAuth error handling below when connector is
      // not custom or completion fails.
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
      } catch (stateError) {
        console.error('[CONNECTOR_CALLBACK] Failed to validate OAuth state for error redirect', {
          provider,
          errorMessage: (stateError as Error | undefined)?.message,
          errorName: (stateError as Error | undefined)?.name,
        });
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
  } catch (err) {
    // Keep error logs minimal and safe (no code/state leakage).
    console.error('[CONNECTOR_CALLBACK] Unhandled error during connector callback', {
      provider: req.params.provider,
      query: redactOAuthCallbackQueryForLogs(req.query as Record<string, unknown>),
      errorMessage: (err as Error | undefined)?.message,
      errorName: (err as Error | undefined)?.name,
    });

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
    } catch (redirectError) {
      console.error('[CONNECTOR_CALLBACK] Failed to build error redirect after unhandled error', {
        provider: req.params.provider,
        errorMessage: (redirectError as Error | undefined)?.message,
        errorName: (redirectError as Error | undefined)?.name,
      });
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
