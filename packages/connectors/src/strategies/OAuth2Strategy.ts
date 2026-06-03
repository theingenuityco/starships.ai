/**
 * OAuth2Strategy — standard authorization-code flow. Covers the bulk of the
 * declarative connectors (Slack, Linear, GitHub-OAuth, etc.) loaded via the adapter.
 */

import type { ConnectorAuthOAuth2V2, ConnectorAuthV2, ConnectorSessionV2 } from '@starships/protocol';
import type {
  AuthStrategy,
  BeginCtx,
  BeginResult,
  CompleteCtx,
  CompleteResult,
  ConnectorAuthKind,
  ConnectorCatalogAuthType,
  SessionCtx,
} from '../types';
import { buildHeaderInjection, resolveTemplateVars, sanitizeForLog } from './shared';

interface TokenResponseFields {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
}

export class OAuth2Strategy implements AuthStrategy {
  readonly kind: ConnectorAuthKind = 'oauth2';
  readonly catalogAuthType: ConnectorCatalogAuthType = 'oauth2';

  constructor(private readonly config: ConnectorAuthOAuth2V2) {}

  async begin(ctx: BeginCtx): Promise<BeginResult> {
    const clientId = await ctx.secrets.resolve(this.config.clientIdRef);
    if (!clientId) {
      throw new Error(`OAuth2 connector is missing platform secret "${this.config.clientIdRef.key}"`);
    }

    const vars: Record<string, unknown> = { ...(ctx.metadata ?? {}), ...(ctx.requestedMetadata ?? {}) };
    const authorizationUrl = resolveTemplateVars(this.config.authorizationUrl, vars);
    const state = await ctx.encodeState({});

    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('redirect_uri', ctx.redirectUri);
    params.set('response_type', 'code');
    if (Array.isArray(this.config.scopes) && this.config.scopes.length > 0) {
      params.set('scope', this.config.scopes.join(this.config.scopeDelimiter ?? ' '));
    }
    params.set('state', state);
    for (const [k, v] of Object.entries(this.config.extraAuthorizeParams ?? {})) {
      params.set(k, resolveTemplateVars(v, vars));
    }

    const sep = authorizationUrl.includes('?') ? '&' : '?';
    return { kind: 'redirect', redirectUrl: `${authorizationUrl}${sep}${params.toString()}` };
  }

  async complete(ctx: CompleteCtx): Promise<CompleteResult> {
    if (ctx.input.error) {
      const err = sanitizeForLog(ctx.input.error);
      const desc = ctx.input.error_description ? ` (${sanitizeForLog(ctx.input.error_description)})` : '';
      throw new Error(`OAuth provider returned error: ${err}${desc}`);
    }
    const code = ctx.input.code;
    if (!code) throw new Error('OAuth callback is missing the authorization code');

    const clientId = await ctx.secrets.resolve(this.config.clientIdRef);
    const clientSecret = await ctx.secrets.resolve(this.config.clientSecretRef);
    if (!clientId || !clientSecret) {
      throw new Error('OAuth2 connector is missing client credentials');
    }

    // metadata (server-controlled, set at connect time) must win over ctx.input
    // (attacker-controlled OAuth callback query string) so a crafted callback
    // param can't override a {{var}} in tokenUrl and redirect the token exchange.
    const tokenUrl = resolveTemplateVars(this.config.tokenUrl, { ...ctx.input, ...(ctx.metadata ?? {}) });
    const fields = await this.exchangeCode({ tokenUrl, code, clientId, clientSecret, redirectUri: ctx.redirectUri });

    if (!fields.accessToken) throw new Error('OAuth token exchange did not return an access token');

    const secrets: Record<string, string> = {};
    if (this.config.accessTokenRef.type === 'connector_secret') {
      secrets[this.config.accessTokenRef.key] = fields.accessToken;
    }
    if (this.config.refreshTokenRef && fields.refreshToken && this.config.refreshTokenRef.type === 'connector_secret') {
      secrets[this.config.refreshTokenRef.key] = fields.refreshToken;
    }

    const metadata: Record<string, unknown> = {};
    if (fields.scope) metadata.scope = fields.scope;
    if (fields.tokenType) metadata.tokenType = fields.tokenType;
    if (typeof fields.expiresIn === 'number') metadata.expiresIn = fields.expiresIn;

    return { secrets, metadata, status: 'connected' };
  }

  async buildSession(ctx: SessionCtx): Promise<ConnectorSessionV2 | null> {
    const token = await ctx.secrets.resolve(this.config.accessTokenRef);
    if (!token) return null;
    const headers = buildHeaderInjection(this.config.injection, token, 'Bearer');
    if (!headers) return null;
    return { headers };
  }

  async refresh(ctx: SessionCtx): Promise<{ secrets: Record<string, string> }> {
    if (!this.config.refreshTokenRef) return { secrets: {} };
    const refreshToken = await ctx.secrets.resolve(this.config.refreshTokenRef);
    const clientId = await ctx.secrets.resolve(this.config.clientIdRef);
    const clientSecret = await ctx.secrets.resolve(this.config.clientSecretRef);
    if (!refreshToken || !clientId || !clientSecret) return { secrets: {} };

    const fields = await this.refreshToken({ tokenUrl: this.config.tokenUrl, refreshToken, clientId, clientSecret });
    const secrets: Record<string, string> = {};
    if (fields.accessToken && this.config.accessTokenRef.type === 'connector_secret') {
      secrets[this.config.accessTokenRef.key] = fields.accessToken;
    }
    if (fields.refreshToken && this.config.refreshTokenRef.type === 'connector_secret') {
      secrets[this.config.refreshTokenRef.key] = fields.refreshToken;
    }
    return { secrets };
  }

  runtimeAuth(): ConnectorAuthV2 {
    return this.config;
  }

  // --- internals -----------------------------------------------------------

  private parseTokenResponse(body: Record<string, unknown>): TokenResponseFields {
    const tr = this.config.tokenResponse ?? {};
    const accessField = tr.accessTokenField ?? 'access_token';
    const refreshField = tr.refreshTokenField ?? 'refresh_token';
    const expiresField = tr.expiresInField ?? 'expires_in';
    const scopeField = tr.scopeField ?? 'scope';
    const typeField = tr.tokenTypeField ?? 'token_type';

    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const num = (v: unknown): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
      return undefined;
    };

    return {
      accessToken: str(body[accessField]),
      refreshToken: str(body[refreshField]),
      expiresIn: num(body[expiresField]),
      scope: str(body[scopeField]),
      tokenType: str(body[typeField]),
    };
  }

  private async postForm(tokenUrl: string, form: Record<string, string>, basicAuth?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    if (basicAuth) headers.Authorization = `Basic ${basicAuth}`;

    const res = await fetch(tokenUrl, { method: 'POST', headers, body: new URLSearchParams(form).toString() });
    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Some providers return form-encoded token responses.
      body = Object.fromEntries(new URLSearchParams(text).entries());
    }
    if (!res.ok) {
      throw new Error(`OAuth token request failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return body;
  }

  private async exchangeCode(args: { tokenUrl: string; code: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<TokenResponseFields> {
    const useBasic = this.config.tokenAuthStyle === 'basic';
    const form: Record<string, string> = {
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
    };
    if (!useBasic) {
      form.client_id = args.clientId;
      form.client_secret = args.clientSecret;
    }
    const basicAuth = useBasic ? Buffer.from(`${args.clientId}:${args.clientSecret}`, 'utf-8').toString('base64') : undefined;
    return this.parseTokenResponse(await this.postForm(args.tokenUrl, form, basicAuth));
  }

  private async refreshToken(args: { tokenUrl: string; refreshToken: string; clientId: string; clientSecret: string }): Promise<TokenResponseFields> {
    const useBasic = this.config.tokenAuthStyle === 'basic';
    const form: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken,
    };
    if (!useBasic) {
      form.client_id = args.clientId;
      form.client_secret = args.clientSecret;
    }
    const basicAuth = useBasic ? Buffer.from(`${args.clientId}:${args.clientSecret}`, 'utf-8').toString('base64') : undefined;
    return this.parseTokenResponse(await this.postForm(args.tokenUrl, form, basicAuth));
  }
}
