import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { ConnectorService } from '@/services/ConnectorService';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import type {
  ConnectorCatalogItem,
  ConnectorCatalogResponse,
  ConnectorListResponse,
  ConnectWithApiKeyRequest,
  ConnectWithBasicAuthRequest,
  StartOAuthRequest,
  StartOAuthResponse,
} from '@starships/protocol';
import { IdSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { getEnvConfig } from '@starships/env';
import { validateOAuthState } from '@/utils/jwt';
import type { ConnectorProvider } from '@starships/protocol';
import { ConnectorTemplateRepository } from '@starships/models';
import { PlatformSecretService } from '@/services/PlatformSecretService';
import { parseExternalLaunchConfigFromAuthJson, verifyExternalLaunchQuery } from '@/utils/external-launch';

const env = getEnvConfig();

const router: Router = Router();

interface OAuthStateContext {
  starshipId?: string;
  provider?: string;
  returnUrl?: string;
}

const ApiKeyConnectSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  extraConfig: z.record(z.string(), z.unknown()).optional(),
});

const BasicConnectSchema = z.object({
  username: z.string().min(1, 'username is required'),
  password: z.string().optional(),
  extraConfig: z.record(z.string(), z.unknown()).optional(),
});

const ProviderParamSchema = z.object({
  id: IdSchema,
  provider: z.string().min(1, 'provider is required'),
});

const StartOAuthBodySchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
  returnUrl: z.string().optional(),
});

function isValidRedirectUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//')) return false;
  // Prevent backslash-based protocol-relative tricks like "/\\evil.com"
  if (url.includes('\\')) return false;
  if (/^(javascript|data):/i.test(url)) return false;
  if (url.includes('@')) return false;
  return true;
}

function addQueryParamsToPath(path: string, params: Record<string, string>): string {
  try {
    // Ensure relative-path handling while preserving existing query/hash.
    const url = new URL(path, env.PUBLIC_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

// GET /connectors/catalog - Static connector catalog (with optional search)
router.get('/connectors/catalog', async (req: Request, res: Response): Promise<void> => {
  try {
    const ConnectorCatalogQuerySchema = z
      .object({
        q: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
      })
      .strict();

    const queryData = validateData(ConnectorCatalogQuerySchema, req.query, res, 'connector catalog query');
    if (!queryData) return;

    const connectorService = new ConnectorService();
    const catalog = await connectorService.getConnectorCatalog();
    const limit = queryData.limit ?? 20;
    const query = (queryData.q ?? '').trim().toLowerCase();

    let results: ConnectorCatalogItem[];

    if (!query) {
      // No query: return a lightweight listing
      results = catalog.slice(0, limit);
    } else {
      // Search: filter by provider name, description, and category
      results = catalog
        .filter((connector) => {
          const providerMatch = connector.provider.toLowerCase().includes(query);
          const nameMatch = connector.name.toLowerCase().includes(query);
          const descMatch = connector.description?.toLowerCase().includes(query) ?? false;
          const categoryMatch = (connector as { category?: string }).category?.toLowerCase().includes(query) ?? false;
          return providerMatch || nameMatch || descMatch || categoryMatch;
        })
        .slice(0, limit);
    }

    const response: ConnectorCatalogResponse = {
      connectors: results,
    };
    sendSuccess(res, response);
  } catch (error) {
    handleError(error, res, 'fetching connector catalog');
  }
});

// Shared handler for provider-initiated external install/launch requests.
// This route is intentionally unauthenticated: it must work before the user logs in.
// External entry is opt-in per connector_template via auth_json.launch.
async function connectorExternalEntryValidateHandler(req: Request, res: Response): Promise<void> {
  try {
    const params = validateData(z.object({ provider: z.string().min(1) }), req.params, res, 'connector provider');
    if (!params) return;

    const { provider } = params;

    const templateRepo = new ConnectorTemplateRepository();
    const template = await templateRepo.findByProvider(provider as ConnectorProvider);
    if (!template) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Connector template not found', 404, { provider });
      return;
    }
    if (template.isEnabled === false) {
      sendError(res, 'FORBIDDEN', 'Connector is disabled', 403, { provider });
      return;
    }

    const launchConfig = parseExternalLaunchConfigFromAuthJson(template.authJson);
    if (!launchConfig) {
      sendError(res, 'FORBIDDEN', 'External launch is not enabled for this connector', 403, { provider });
      return;
    }

    const secretSvc = new PlatformSecretService();
    const secret = await secretSvc.getSecret(launchConfig.secretRef.key);
    if (!secret) {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'External launch secret not configured', 500, {
        provider,
        secretKey: launchConfig.secretRef.key,
      });
      return;
    }

    const result = verifyExternalLaunchQuery(launchConfig, secret, req.query as Record<string, unknown>);
    if (!result.ok) {
      const code = result.status === 400 ? 'VALIDATION_ERROR' : result.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'FORBIDDEN';
      sendError(res, code, result.message, result.status, { provider });
      return;
    }

    sendSuccess(res, {
      ok: true,
      provider,
      verifiedLaunchMetadata: result.verifiedLaunchMetadata,
    });
  } catch (error) {
    handleError(error, res, 'validating external connector launch');
  }
}

// Preferred route name: /install
router.get('/connectors/:provider/install/validate', connectorExternalEntryValidateHandler);

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

// POST /starships/:id/connectors/:provider/basic - Connect via HTTP Basic auth
router.post('/starships/:id/connectors/:provider/basic', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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

    const bodyValidation = validateData(BasicConnectSchema, req.body as ConnectWithBasicAuthRequest, res, 'basic auth connector payload');
    if (!bodyValidation) return;

    const connectorService = new ConnectorService();
    const connector = await connectorService.connectWithBasicAuth(
      starshipId,
      provider,
      bodyValidation as ConnectWithBasicAuthRequest,
      userId
    );

    sendSuccess(res, { connector });
  } catch (error) {
    handleError(error, res, 'connecting connector via basic auth');
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

    const bodyValidation = validateData(StartOAuthBodySchema, (req.body ?? {}) as StartOAuthRequest, res, 'start connector payload');
    if (!bodyValidation) return;

    const connectorService = new ConnectorService();

    const authorizationUrl = await connectorService.startConnector(starshipId, userId, provider as ConnectorProvider, {
      metadata: bodyValidation.metadata,
      returnUrl: bodyValidation.returnUrl,
    });

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

    // Optional: verify provider-signed callback query when the connector template opts in.
    // This is used by providers like Shopify that sign callback params with an HMAC.
    try {
      const templateRepo = new ConnectorTemplateRepository();
      const template = await templateRepo.findByProvider(provider as ConnectorProvider);
      const launchConfig = template ? parseExternalLaunchConfigFromAuthJson(template.authJson) : null;

      if (launchConfig) {
        const signatureKey = launchConfig.signatureKey || 'hmac';
        const hasSignature = req.query?.[signatureKey] !== undefined;

        // Only enforce verification when a signature is actually present on the callback.
        if (hasSignature) {
          const secretSvc = new PlatformSecretService();
          const secret = await secretSvc.getSecret(launchConfig.secretRef.key);
          if (!secret) {
            throw new Error(`External launch secret not configured (${launchConfig.secretRef.key})`);
          }

          const verify = verifyExternalLaunchQuery(launchConfig, secret, req.query as Record<string, unknown>);
          if (!verify.ok) {
            const redirectParams = new URLSearchParams({
              connector: provider,
              status: 'error',
            });
            const redirectUrl = `/?${redirectParams.toString()}`;
            res.redirect(redirectUrl);
            return;
          }
        }
      }
    } catch (verifyError) {
      console.error('[CONNECTOR_CALLBACK] External callback signature verification failed', {
        provider,
        errorMessage: (verifyError as Error | undefined)?.message,
        errorName: (verifyError as Error | undefined)?.name,
      });
      const redirectParams = new URLSearchParams({
        connector: provider,
        status: 'error',
      });
      const redirectUrl = `/?${redirectParams.toString()}`;
      res.redirect(redirectUrl);
      return;
    }

    const connectorService = new ConnectorService();

    const buildStarshipRedirect = (starshipId: string, starshipSlug: string | undefined, params: URLSearchParams): string => {
      const basePath =
        starshipSlug !== undefined && starshipSlug.length > 0
          ? `/ship/${encodeURIComponent(starshipSlug)}/connectors`
          : `/ship/${encodeURIComponent(starshipId)}/connectors`;
      return `${basePath}?${params.toString()}`;
    };

    // Custom connector completion is removed in v2 (no fallback).

    if (error || !code) {
      try {
        const stateValidation = await validateOAuthState(state);
        if (stateValidation.valid) {
          const ctx = stateValidation.context as OAuthStateContext | undefined;
          const starshipId = ctx?.starshipId as string | undefined;
          const providerFromState = ctx?.provider as string | undefined;
          const returnUrl = ctx?.returnUrl as string | undefined;

          if (starshipId) {
            const redirectParams = new URLSearchParams({
              connector: providerFromState || provider,
              status: 'error',
            });
            if (returnUrl && isValidRedirectUrl(returnUrl)) {
              const withParams = addQueryParamsToPath(returnUrl, {
                connector: providerFromState || provider,
                status: 'error',
              });
              res.redirect(withParams);
            } else {
              const redirectUrl = buildStarshipRedirect(starshipId, undefined, redirectParams);
              res.redirect(redirectUrl);
            }
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
      const redirectUrl = `/?${redirectParams.toString()}`;
      res.redirect(redirectUrl);
      return;
    }

    const { starshipId, starshipSlug, returnUrl } = await connectorService.completeOAuthConnector(
      provider as ConnectorProvider,
      code,
      state,
      req.query as Record<string, unknown>
    );

    if (returnUrl && isValidRedirectUrl(returnUrl)) {
      const withParams = addQueryParamsToPath(returnUrl, { connector: provider, status: 'success' });
      res.redirect(withParams);
    } else {
      const redirectParams = new URLSearchParams({
        connector: provider,
        status: 'success',
      });
      const redirectUrl = buildStarshipRedirect(starshipId, starshipSlug, redirectParams);
      res.redirect(redirectUrl);
    }
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
          const returnUrl = ctx?.returnUrl as string | undefined;
          const redirectParams = new URLSearchParams({
            connector: provider || ctx?.provider || 'unknown',
            status: 'error',
          });

          if (starshipId) {
            if (returnUrl && isValidRedirectUrl(returnUrl)) {
              const withParams = addQueryParamsToPath(returnUrl, {
                connector: String(provider || ctx?.provider || 'unknown'),
                status: 'error',
              });
              res.redirect(withParams);
            } else {
              const basePath = `/ship/${encodeURIComponent(starshipId)}/connectors`;
              const redirectUrl = `${basePath}?${redirectParams.toString()}`;
              res.redirect(redirectUrl);
            }
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
      connector: req.params.provider || 'unknown',
      status: 'error',
    });
    const redirectUrl = `/?${redirectParams.toString()}`;
    res.redirect(redirectUrl);
  }
}

// GET /connectors/:provider/callback - Generic connector callback route
router.get('/connectors/:provider/callback', connectorCallbackHandler);

export default router;
