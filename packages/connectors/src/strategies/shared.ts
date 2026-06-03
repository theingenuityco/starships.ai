/**
 * Shared helpers for auth strategies. These mirror the behavior previously inlined
 * in the server's ConnectorActionSessionService so that swapping the source to the
 * code registry preserves runtime sessions byte-for-byte.
 */

import type { ConnectorDbSessionV2 } from '@starships/protocol';

/** RFC 7617 HTTP Basic header value: `Basic base64("username:password")`. */
export function buildBasicAuthHeaderValue(username: string, password: string): string {
  const raw = `${username}:${password ?? ''}`;
  return `Basic ${Buffer.from(raw, 'utf-8').toString('base64')}`;
}

function coerceBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  }
  return undefined;
}

function coerceInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return undefined;
}

function coerceNonEmptyString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Build a Postgres connection session from connector metadata (basic-auth SQL connectors). */
export function buildPostgresDbSession(args: {
  metadata: Record<string, unknown>;
  user: string;
  password?: string;
}): ConnectorDbSessionV2 | null {
  const md = args.metadata ?? {};
  const host =
    coerceNonEmptyString(md.host) ??
    coerceNonEmptyString(md.hostname) ??
    coerceNonEmptyString(md.pgHost) ??
    coerceNonEmptyString(md.postgresHost);
  const port = coerceInt(md.port ?? md.pgPort ?? md.postgresPort) ?? 5432;
  const database =
    coerceNonEmptyString(md.database) ??
    coerceNonEmptyString(md.db) ??
    coerceNonEmptyString(md.pgDatabase) ??
    coerceNonEmptyString(md.postgresDatabase);

  if (!host || !database) return null;

  const ssl = coerceBool(md.ssl ?? md.pgSsl ?? md.postgresSsl);

  return {
    driver: 'postgres',
    host,
    port,
    database,
    user: args.user,
    ...(args.password ? { password: args.password } : {}),
    ...(ssl !== undefined ? { ssl } : {}),
  };
}

/**
 * Dynamic import that stays a real `import()` even when TypeScript compiles to
 * CommonJS (avoids TS rewriting it to require()), so ESM-only deps like jose can
 * be loaded from a CJS build / CJS Jest environment.
 */
export function dynamicImport<T = unknown>(modulePath: string): Promise<T> {
  const importer = new Function('m', 'return import(m)') as (m: string) => Promise<T>;
  return importer(modulePath);
}

/**
 * Sanitize an untrusted value (e.g. an OAuth callback query parameter) before
 * embedding it in a log line or error message. Strips CR/LF to prevent log
 * injection / forged log entries and caps the length.
 */
export function sanitizeForLog(value: unknown, maxLength = 200): string {
  return String(value ?? '')
    .replace(/[\r\n]/g, ' ')
    .slice(0, maxLength);
}

/** Replace `{{ key }}` occurrences in a template string with values from `vars`. */
export function resolveTemplateVars(input: string, vars: Record<string, unknown>): string {
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Extract the `{{ key }}` variable names referenced by a template string. */
export function extractTemplateVarKeys(input: string): string[] {
  const keys = new Set<string>();
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) keys.add(m[1]);
  return [...keys];
}

/** Header-style token injection. Returns null when style is not 'header' (query-style is unsupported in sessions). */
export function buildHeaderInjection(
  injection: { style: 'header' | 'query'; headerName?: string; tokenPrefix?: string } | undefined,
  token: string,
  defaultPrefix: string
): Record<string, string> | null {
  const inj = injection ?? { style: 'header' as const };
  if (inj.style !== 'header') return null;
  const headerName = typeof inj.headerName === 'string' && inj.headerName.trim() ? inj.headerName.trim() : 'Authorization';
  const prefix = typeof inj.tokenPrefix === 'string' ? inj.tokenPrefix : defaultPrefix;
  return { [headerName]: prefix ? `${prefix} ${token}` : token };
}
