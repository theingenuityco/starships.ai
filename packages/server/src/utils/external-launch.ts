import crypto from 'crypto';
import type { SecretRef } from '@starships/protocol';
import { AppError } from '@starships/errors';

export type ExternalLaunchType = 'hmac_sha256_hex';

export interface ExternalLaunchConfigHmacSha256Hex {
  type: 'hmac_sha256_hex';
  /**
   * Secret used to verify the provider-signed launch query.
   * Must be a platform_secret SecretRef.
   */
  secretRef: SecretRef;
  /**
   * List of required keys that must exist in the incoming query.
   * Keep this explicit to avoid accidental acceptance of partial payloads.
   */
  requiredKeys: string[];
  /**
   * Query key holding the signature. Defaults to "hmac".
   */
  signatureKey?: string;
  /**
   * Query key holding the unix timestamp (seconds). Defaults to "timestamp".
   */
  timestampKey?: string;
  /**
   * Max allowed age of the request (seconds). Defaults to 300.
   */
  maxAgeSeconds?: number;
}

export type ExternalLaunchConfig = ExternalLaunchConfigHmacSha256Hex;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function pickFirstQueryValue(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  if (val === undefined || val === null) return undefined;
  return String(val);
}

/**
 * Parse + validate auth.launch config from a connector template auth_json object.
 *
 * This is intentionally strict: external launch is opt-in and must be verifiable.
 */
export function parseExternalLaunchConfigFromAuthJson(authJson: unknown): ExternalLaunchConfig | null {
  if (!isPlainObject(authJson)) return null;
  const launchRaw = (authJson as Record<string, unknown>).launch;
  if (!isPlainObject(launchRaw)) return null;

  const type = pickFirstQueryValue((launchRaw as Record<string, unknown>).type);
  if (type !== 'hmac_sha256_hex') {
    return null;
  }

  const secretRefRaw = (launchRaw as Record<string, unknown>).secretRef;
  if (!isPlainObject(secretRefRaw)) {
    throw new AppError('Invalid launch config: secretRef is required', 'VALIDATION_FAILED', 400);
  }

  const secretRef = {
    type: pickFirstQueryValue(secretRefRaw.type),
    key: pickFirstQueryValue(secretRefRaw.key),
  } as unknown as SecretRef;

  if (secretRef.type !== 'platform_secret' || typeof secretRef.key !== 'string' || !secretRef.key.trim()) {
    throw new AppError('Invalid launch config: secretRef must be a platform_secret SecretRef', 'VALIDATION_FAILED', 400);
  }

  const requiredKeysRaw = (launchRaw as Record<string, unknown>).requiredKeys;
  if (!Array.isArray(requiredKeysRaw) || requiredKeysRaw.some((k) => typeof k !== 'string' || !k.trim())) {
    throw new AppError('Invalid launch config: requiredKeys must be a string[]', 'VALIDATION_FAILED', 400);
  }

  const signatureKey = pickFirstQueryValue((launchRaw as Record<string, unknown>).signatureKey) || 'hmac';
  const timestampKey = pickFirstQueryValue((launchRaw as Record<string, unknown>).timestampKey) || 'timestamp';
  const maxAgeSecondsRaw = (launchRaw as Record<string, unknown>).maxAgeSeconds;
  const maxAgeSeconds =
    typeof maxAgeSecondsRaw === 'number' && Number.isFinite(maxAgeSecondsRaw) && maxAgeSecondsRaw > 0 ? maxAgeSecondsRaw : 300;

  return {
    type: 'hmac_sha256_hex',
    secretRef: { type: 'platform_secret', key: secretRef.key.trim() },
    requiredKeys: requiredKeysRaw.map((k) => k.trim()),
    signatureKey: signatureKey.trim(),
    timestampKey: timestampKey.trim(),
    maxAgeSeconds,
  };
}

export function buildCanonicalQueryStringForHmac(query: Record<string, unknown>, signatureKey: string): string {
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(query)) {
    if (!k) continue;
    if (k === signatureKey) continue;
    const val = pickFirstQueryValue(v);
    if (val === undefined) continue;
    entries.push([k, val]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join('&');
}

export function computeHmacSha256Hex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export function verifyExternalLaunchQuery(
  config: ExternalLaunchConfigHmacSha256Hex,
  secret: string,
  query: Record<string, unknown>,
  nowMs: number = Date.now()
): { ok: true; verifiedLaunchMetadata: Record<string, unknown> } | { ok: false; status: number; message: string } {
  const signatureKey = config.signatureKey || 'hmac';
  const timestampKey = config.timestampKey || 'timestamp';

  for (const k of config.requiredKeys) {
    const v = pickFirstQueryValue(query[k]);
    if (!v || !String(v).trim()) {
      return { ok: false, status: 400, message: `Missing required launch query parameter: ${k}` };
    }
  }

  const providedSig = (pickFirstQueryValue(query[signatureKey]) || '').trim();
  if (!providedSig) {
    return { ok: false, status: 401, message: 'Missing launch signature' };
  }

  const tsRaw = (pickFirstQueryValue(query[timestampKey]) || '').trim();
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, status: 400, message: 'Invalid launch timestamp' };
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  const ageSeconds = Math.abs(nowSeconds - ts);
  const maxAgeSeconds = config.maxAgeSeconds ?? 300;
  if (ageSeconds > maxAgeSeconds) {
    return { ok: false, status: 401, message: 'Launch request expired' };
  }

  const canonical = buildCanonicalQueryStringForHmac(query, signatureKey);
  const computed = computeHmacSha256Hex(secret, canonical);
  if (!safeEqual(computed, providedSig)) {
    return { ok: false, status: 401, message: 'Invalid launch signature' };
  }

  // Return query as metadata, excluding signature (never treat signature as metadata).
  const verifiedLaunchMetadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(query)) {
    if (!k || k === signatureKey) continue;
    if (v !== undefined) verifiedLaunchMetadata[k] = v;
  }

  return { ok: true, verifiedLaunchMetadata };
}

