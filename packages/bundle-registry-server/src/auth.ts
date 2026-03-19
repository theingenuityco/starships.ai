import type { Request, Response, NextFunction } from 'express';
import { getBundleRegistryEnv } from '@/env';

function readBearerToken(req: Request): string {
  const raw = String(req.headers.authorization || '').trim();
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? '';
}

export function requireRegistryInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const env = getBundleRegistryEnv();
  const token = readBearerToken(req);
  if (!token || token !== env.BUNDLE_REGISTRY_AUTH_TOKEN) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  next();
}

