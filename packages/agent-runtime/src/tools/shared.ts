// Shared helpers for tool implementations: output clipping, workspace-scoped path
// resolution (lexical + symlink safe), and the SSRF host guard. Extracted from the old
// flat tools.ts so every provider (system, and later user-bundle / mcp) reuses one copy.
import path from 'node:path';
import { realpath } from 'node:fs/promises';

export const MAX_OUTPUT = 100_000;
export const DEFAULT_EXEC_TIMEOUT_MS = 120_000;

export function clip(s: string): string {
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n…[truncated]` : s;
}

/** True if `rel` (a relative path from path.relative) escapes its base. */
function escapes(rel: string): boolean {
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

/**
 * Resolve `p` inside `workspace`, refusing paths that escape it lexically OR via symlink.
 * path.resolve/relative only see the lexical path, so a symlink inside the workspace pointing
 * out (workspace/link -> /etc) would otherwise pass. After the lexical check we realpath the
 * target — or its nearest existing ancestor, for not-yet-created files — and re-assert containment.
 */
export async function resolveInWorkspace(workspace: string, p: string): Promise<string> {
  const abs = path.resolve(workspace, p);
  if (escapes(path.relative(workspace, abs))) {
    throw new Error(`Path escapes the workspace: ${p}`);
  }
  const realWs = await realpath(workspace);
  let probe = abs;
  for (;;) {
    try {
      if (escapes(path.relative(realWs, await realpath(probe)))) {
        throw new Error(`Path escapes the workspace via symlink: ${p}`);
      }
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      const parent = path.dirname(probe);
      if (parent === probe) break; // reached the filesystem root
      probe = parent;
    }
  }
  return abs;
}

/** Hostname of `url`, IPv6 brackets stripped and lowercased. */
export function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** True if `host` is a loopback / private / link-local target we refuse to fetch (SSRF guard). */
export function isBlockedHost(host: string): boolean {
  return (
    ['127.0.0.1', '0.0.0.0', 'localhost', '::1', '::'].includes(host) ||
    host.endsWith('.localhost') ||
    /^(10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    // IPv6 link-local/ULA, plus IPv4-mapped IPv6 (::ffff:127.0.0.1) wholesale.
    (host.includes(':') && /^(fe80|fc|fd|::ffff:)/.test(host))
  );
}
