import type { Request, Response } from 'express';
import { getEnvConfig } from '@starships/env';

export const AUTH_COOKIE_NAME = 'ss_auth';

type CookieOpts = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  domain?: string;
  maxAge: number;
};

function getCookieDomainFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase();

    // Production: share cookie across all subdomains.
    if (host === 'starships.ai' || host.endsWith('.starships.ai')) return '.starships.ai';

    // Local dev: support `*.localhost` (e.g. app.starships.localhost).
    if (host === 'localhost') return undefined;
    if (host.endsWith('.localhost')) return '.localhost';

    return undefined;
  } catch {
    return undefined;
  }
}

export function getAuthCookieOptions(): CookieOpts {
  const env = getEnvConfig();
  const isProd = env.NODE_ENV === 'production';
  const domain = getCookieDomainFromUrl(env.APP_URL || env.PUBLIC_URL);

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    domain,
    // JWTs are issued with 7d expiration. Keep cookie aligned.
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function getAuthTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const cookies = (req as any).cookies as Record<string, string> | undefined;
  const cookieToken = cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken && typeof cookieToken === 'string' && cookieToken.trim()) return cookieToken.trim();

  return null;
}

export function setAuthCookie(res: Response, token: string): void {
  const opts = getAuthCookieOptions();
  res.cookie(AUTH_COOKIE_NAME, token, opts);
}

export function clearAuthCookie(res: Response): void {
  const opts = getAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, { path: opts.path, domain: opts.domain });
}

