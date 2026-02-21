import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
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
import { IdSchema, PaginationSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { getEnvConfig } from '@starships/env';
import { validateOAuthState } from '@/utils/jwt';
import type { ConnectorProvider } from '@starships/protocol';
import { ConnectorTemplateRepository, ToolTemplateRepository } from '@starships/models';
import { PlatformSecretService } from '@/services/PlatformSecretService';
import { parseExternalLaunchConfigFromAuthJson, verifyExternalLaunchQuery } from '@/utils/external-launch';

const env = getEnvConfig();

const router: Router = Router();

type ConnectionLike = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
};

type ConnectorPopularityScore = { conv: number; tokens: number };

// Cache connector popularity scores to avoid running the heavy analytics query on every catalog request.
// This endpoint is public and can be called frequently (e.g. marketplace browsing).
const CONNECTOR_CATALOG_POPULARITY_TTL_MS = 5 * 60 * 1000;
let cachedConnectorCatalogPopularity:
  | { key: string; expiresAt: number; score: Map<string, ConnectorPopularityScore> }
  | null = null;

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

function normalizeBaseUrl(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function hostOf(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function pickFrontendBaseUrlForRequest(req: Request): string {
  const landing = normalizeBaseUrl(env.PUBLIC_URL);
  const app = normalizeBaseUrl(env.APP_URL);
  const landingHost = hostOf(landing);
  const appHost = hostOf(app);

  const reqHost = String((req.headers['x-forwarded-host'] as string) || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (landingHost && reqHost === landingHost) return landing;
  if (appHost && reqHost === appHost) return app;

  // Fallback: prefer app as the canonical auth/app base.
  return app || landing;
}

// GET /connectors/catalog - Static connector catalog (with optional search)
router.get('/connectors/catalog', async (req: Request, res: Response): Promise<void> => {
  try {
    const ConnectorCatalogQuerySchema = PaginationSchema.extend({
      q: z.string().optional(),
      // Keep legacy behavior: `limit` is optional and capped smaller.
      limit: z.coerce.number().int().min(1).max(100).optional(),
      // `page` is optional: if omitted, we return the legacy "all connectors" payload.
      page: z.coerce.number().int().min(1).optional(),
    }).strict();

    const queryData = validateData(ConnectorCatalogQuerySchema, req.query, res, 'connector catalog query');
    if (!queryData) return;

    const connectorService = new ConnectorService();
    const catalog = await connectorService.getConnectorCatalog();
    const query = (queryData.q ?? '').trim().toLowerCase();

    let results: ConnectorCatalogItem[];

    if (!query) {
      // No query: start from full enabled catalog
      results = catalog;
    } else {
      // Search: filter by provider name, description, and category
      const filtered = catalog.filter((connector) => {
        const providerMatch = connector.provider.toLowerCase().includes(query);
        const nameMatch = connector.name.toLowerCase().includes(query);
        const descMatch = connector.description?.toLowerCase().includes(query) ?? false;
        const categoryMatch = (connector as { category?: string }).category?.toLowerCase().includes(query) ?? false;
        return providerMatch || nameMatch || descMatch || categoryMatch;
      });
      results = filtered;
    }

    // Sort catalog by observed usage in conversations (do NOT use connector_templates.usage_count).
    // We approximate connector popularity by attributing tool calls to the connector providers
    // required by the tool template (tool_templates.required_connector_providers).
    try {
      const providers = results
        .map((c) => (c && typeof c.provider === 'string' ? c.provider.trim() : ''))
        .filter((p) => p.length > 0);

      if (providers.length > 0) {
        const providerKey = [...providers].sort().join('|');
        const now = Date.now();
        const cached =
          cachedConnectorCatalogPopularity &&
          cachedConnectorCatalogPopularity.key === providerKey &&
          cachedConnectorCatalogPopularity.expiresAt > now
            ? cachedConnectorCatalogPopularity.score
            : null;

        if (cached) {
          results = [...results].sort((a, b) => {
            const ap = String(a.provider || '').trim();
            const bp = String(b.provider || '').trim();
            const as = cached.get(ap) ?? { conv: 0, tokens: 0 };
            const bs = cached.get(bp) ?? { conv: 0, tokens: 0 };
            if (bs.conv !== as.conv) return bs.conv - as.conv;
            if (bs.tokens !== as.tokens) return bs.tokens - as.tokens;
            return ap.localeCompare(bp);
          });
        } else {
        const toolTemplateRepo = new ToolTemplateRepository();
        const connection = (((toolTemplateRepo as any).getConnection?.() ?? null) as unknown as ConnectionLike | null) ?? null;

        if (connection?.query) {
          const windowDays = 30;
          const rows = await connection.query<{ provider: string; conversation_count: number; token_count: string | number | null }>(
            `
              WITH tool_calls AS (
                SELECT
                  (tc -> 'function' ->> 'name') AS tool_slug,
                  m.conversation_id AS conversation_id
                FROM messages m
                JOIN LATERAL jsonb_array_elements(m.tool_calls) tc ON TRUE
                WHERE m.role = 'assistant'
                  AND m.tool_calls IS NOT NULL
                  AND jsonb_typeof(m.tool_calls) = 'array'
                  AND m.created_at >= NOW() - ($1::int * INTERVAL '1 day')
              ),
              used AS (
                SELECT DISTINCT
                  prov AS provider,
                  tc.conversation_id AS conversation_id
                FROM tool_calls tc
                JOIN tool_templates tt ON tt.slug = tc.tool_slug
                JOIN LATERAL unnest(COALESCE(tt.required_connector_providers, '{}'::text[])) prov ON TRUE
                WHERE tc.tool_slug IS NOT NULL
                  AND tc.tool_slug <> ''
                  AND prov = ANY($2::text[])
              ),
              counts AS (
                SELECT provider, COUNT(DISTINCT conversation_id)::int AS conversation_count
                FROM used
                GROUP BY provider
              ),
              tokens AS (
                SELECT u.provider AS provider, COALESCE(SUM(us.total_tokens), 0)::bigint AS token_count
                FROM used u
                JOIN usage us ON us.conversation_id = u.conversation_id
                WHERE us.created_at >= NOW() - ($1::int * INTERVAL '1 day')
                GROUP BY u.provider
              )
              SELECT c.provider, c.conversation_count, t.token_count
              FROM counts c
              LEFT JOIN tokens t ON t.provider = c.provider
            `,
            [windowDays, providers]
          );

          const score = new Map<string, ConnectorPopularityScore>();
          for (const r of rows || []) {
            const provider = typeof r?.provider === 'string' ? String(r.provider).trim() : '';
            if (!provider) continue;
            const conv = typeof r?.conversation_count === 'number' ? r.conversation_count : 0;
            const tokensRaw = r?.token_count;
            const tokens = typeof tokensRaw === 'number' ? tokensRaw : typeof tokensRaw === 'string' ? Number(tokensRaw) : 0;
            score.set(provider, { conv: Number.isFinite(conv) ? conv : 0, tokens: Number.isFinite(tokens) ? tokens : 0 });
          }

          cachedConnectorCatalogPopularity = {
            key: providerKey,
            expiresAt: now + CONNECTOR_CATALOG_POPULARITY_TTL_MS,
            score,
          };

          results = [...results].sort((a, b) => {
            const ap = String(a.provider || '').trim();
            const bp = String(b.provider || '').trim();
            const as = score.get(ap) ?? { conv: 0, tokens: 0 };
            const bs = score.get(bp) ?? { conv: 0, tokens: 0 };
            if (bs.conv !== as.conv) return bs.conv - as.conv;
            if (bs.tokens !== as.tokens) return bs.tokens - as.tokens;
            return ap.localeCompare(bp);
          });
        }
        }
      }
    } catch {
      // Best-effort only: fall back to ConnectorService ordering
    }

    const total = results.length;

    // Legacy behavior:
    // - If the caller didn't ask for a specific page AND didn't set a limit, return everything.
    const wantsPaging = queryData.page !== undefined || queryData.limit !== undefined;
    if (wantsPaging) {
      const page = queryData.page ?? 1;
      const limit = queryData.limit ?? 50;
      const offset = (page - 1) * limit;
      results = results.slice(offset, offset + limit);
      sendSuccess(res, { connectors: results } satisfies ConnectorCatalogResponse, 200, {
        pagination: {
          page,
          limit,
          total,
          has_next: page * limit < total,
          has_prev: page > 1,
        },
      });
      return;
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

    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

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

    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

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

    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

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

    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

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

    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

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

    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

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

    if (!(await verifyStarshipOwnerAccess(starshipId, userId, res))) return;

    const bodyValidation = validateData(StartOAuthBodySchema, (req.body ?? {}) as StartOAuthRequest, res, 'start connector payload');
    if (!bodyValidation) return;

    const connectorService = new ConnectorService();

    const authorizationUrl = await connectorService.startConnector(starshipId, userId, provider as ConnectorProvider, {
      metadata: bodyValidation.metadata,
      returnUrl: bodyValidation.returnUrl,
      redirectBaseUrl: pickFrontendBaseUrlForRequest(req),
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
  const landingBase = normalizeBaseUrl(env.PUBLIC_URL);
  const appBase = normalizeBaseUrl(env.APP_URL);

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
            const redirectUrl = `${landingBase}/?${redirectParams.toString()}`;
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
      const redirectUrl = `${landingBase}/?${redirectParams.toString()}`;
      res.redirect(redirectUrl);
      return;
    }

    const connectorService = new ConnectorService();

    const buildStarshipRedirect = (starshipId: string, starshipSlug: string | undefined, params: URLSearchParams): string => {
      const basePath =
        starshipSlug !== undefined && starshipSlug.length > 0
          ? `/ship/${encodeURIComponent(starshipSlug)}/connectors`
          : `/ship/${encodeURIComponent(starshipId)}/connectors`;
      return `${appBase}${basePath}?${params.toString()}`;
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
      const redirectUrl = `${landingBase}/?${redirectParams.toString()}`;
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
              const redirectUrl = `${appBase}${basePath}?${redirectParams.toString()}`;
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
    const redirectUrl = `${landingBase}/?${redirectParams.toString()}`;
    res.redirect(redirectUrl);
  }
}

// GET /connectors/:provider/callback - Generic connector callback route
router.get('/connectors/:provider/callback', connectorCallbackHandler);

export default router;
