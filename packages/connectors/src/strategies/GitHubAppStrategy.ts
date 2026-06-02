/**
 * GitHubAppStrategy — GitHub App installation flow with bot identity.
 *
 * Connect: redirect the user to the App's installation page. The callback carries an
 * installation_id, which we persist in connector metadata (not a secret).
 *
 * Runtime: per session we sign a short-lived RS256 App JWT from the App private key
 * (in env) and exchange it for an installation access token (~1h). The token is the
 * Authorization header handed to the runner, and the same token works for git over
 * HTTPS as `x-access-token:<token>`. PRs are authored by the App's bot identity.
 *
 * Configuration (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY as base64-encoded PEM,
 * GITHUB_APP_SLUG) is resolved as platform secrets first (encrypted, instance-admin
 * managed) and falls back to env vars of the same name for local development.
 */

import { SignJWT, importPKCS8 } from 'jose';
import type { ConnectorAuthV2, ConnectorSessionV2 } from '@starships/protocol';
import type {
  AuthStrategy,
  BeginCtx,
  BeginResult,
  CompleteCtx,
  CompleteResult,
  ConfigFieldSpec,
  ConnectorAuthKind,
  ConnectorCatalogAuthType,
  ConnectorEnv,
  SecretResolver,
  SessionCtx,
} from '../types';

/** Minimal context needed to resolve GitHub App configuration. */
type ConfigCtx = { env: ConnectorEnv; secrets: SecretResolver };

/** Platform-level config keys (stored as platform secrets, env fallback for local dev). */
const CONFIG_KEYS = ['GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_APP_PRIVATE_KEY'] as const;

const GITHUB_API = 'https://api.github.com';
/** Refresh the cached installation token this many ms before it actually expires. */
const TOKEN_SKEW_MS = 60_000;

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

export class GitHubAppStrategy implements AuthStrategy {
  readonly kind: ConnectorAuthKind = 'github_app';
  readonly catalogAuthType: ConnectorCatalogAuthType = 'github_app';

  private readonly tokenCache = new Map<string, CachedToken>();

  readonly configFields: ConfigFieldSpec[] = [
    { key: 'GITHUB_APP_ID', label: 'App ID', type: 'string', required: true, description: 'The numeric GitHub App ID.' },
    { key: 'GITHUB_APP_SLUG', label: 'App slug', type: 'string', required: true, description: 'The App URL slug (github.com/apps/<slug>).' },
    {
      key: 'GITHUB_APP_PRIVATE_KEY',
      label: 'Private key (base64 PEM)',
      type: 'textarea',
      required: true,
      description: 'The App private key PEM, base64-encoded: `base64 -i key.pem | tr -d "\\n"`.',
    },
  ];

  async isConfigured(ctx: ConfigCtx): Promise<boolean> {
    for (const key of CONFIG_KEYS) {
      if (!(await this.resolveConfig(ctx, key))) return false;
    }
    return true;
  }

  async begin(ctx: BeginCtx): Promise<BeginResult> {
    const slug = await this.resolveConfig(ctx, 'GITHUB_APP_SLUG');
    if (!slug) throw new Error('GITHUB_APP_SLUG is not configured (set it as a platform secret or env var)');
    const state = await ctx.encodeState({});
    const redirectUrl = `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
    return { kind: 'redirect', redirectUrl };
  }

  async complete(ctx: CompleteCtx): Promise<CompleteResult> {
    if (ctx.input.error) {
      throw new Error(`GitHub App install returned error: ${ctx.input.error}`);
    }
    const installationId = ctx.input.installation_id;
    if (!installationId) throw new Error('GitHub App callback is missing installation_id');
    return {
      secrets: {},
      metadata: {
        installationId,
        ...(ctx.input.setup_action ? { setupAction: ctx.input.setup_action } : {}),
      },
      status: 'connected',
    };
  }

  async buildSession(ctx: SessionCtx): Promise<ConnectorSessionV2 | null> {
    const installationId = this.readInstallationId(ctx.metadata);
    if (!installationId) return null;
    const token = await this.getInstallationToken(ctx, installationId);
    if (!token) return null;
    return { headers: { Authorization: `Bearer ${token}` } };
  }

  runtimeAuth(): ConnectorAuthV2 {
    // The runner applies session.headers and never re-resolves this; keep it runner-safe.
    return { type: 'none' };
  }

  // --- internals -----------------------------------------------------------

  private readInstallationId(metadata: Record<string, unknown> | undefined): string | null {
    const raw = metadata?.installationId ?? metadata?.installation_id;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
    return null;
  }

  /** Resolve App config: platform secret first (encrypted), env var fallback for local dev. */
  private async resolveConfig(ctx: ConfigCtx, key: string): Promise<string | undefined> {
    const fromPlatform = await ctx.secrets.resolve({ type: 'platform_secret', key });
    if (fromPlatform && fromPlatform.trim()) return fromPlatform.trim();
    const fromEnv = ctx.env.get(key);
    return fromEnv && fromEnv.trim() ? fromEnv.trim() : undefined;
  }

  /** Mint (or reuse a cached) installation access token for the given installation. */
  private async getInstallationToken(ctx: ConfigCtx, installationId: string): Promise<string | null> {
    const cached = this.tokenCache.get(installationId);
    if (cached && cached.expiresAtMs - TOKEN_SKEW_MS > Date.now()) {
      return cached.token;
    }

    const appJwt = await this.signAppJwt(ctx);
    const res = await fetch(`${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GitHub installation token request failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const body = JSON.parse(text) as { token?: string; expires_at?: string };
    if (!body.token) throw new Error('GitHub installation token response did not include a token');

    const expiresAtMs = body.expires_at ? Date.parse(body.expires_at) : Date.now() + 60 * 60 * 1000;
    this.tokenCache.set(installationId, { token: body.token, expiresAtMs });
    return body.token;
  }

  /** Sign a short-lived RS256 App JWT (iss = App ID), valid for <= 10 minutes. */
  private async signAppJwt(ctx: ConfigCtx): Promise<string> {
    const appId = await this.resolveConfig(ctx, 'GITHUB_APP_ID');
    const privateKeyB64 = await this.resolveConfig(ctx, 'GITHUB_APP_PRIVATE_KEY');
    if (!appId) throw new Error('GITHUB_APP_ID is not configured (set it as a platform secret or env var)');
    if (!privateKeyB64) throw new Error('GITHUB_APP_PRIVATE_KEY is not configured (set it as a platform secret or env var)');

    const pem = Buffer.from(privateKeyB64, 'base64').toString('utf-8');
    const key = await importPKCS8(pem, 'RS256');

    const nowSec = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(nowSec - 60) // allow for clock drift per GitHub guidance
      .setExpirationTime(nowSec + 540) // 9 minutes (GitHub max is 10)
      .setIssuer(appId)
      .sign(key);
  }
}
