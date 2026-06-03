import type { GitCredentials } from '@starships/autopilot';
import type { ConnectorSessionV2 as ConnectorSession } from '@starships/protocol';

/**
 * Native git (clone/push) reuses the token the `github` connector already
 * resolves via ConnectorActionSessionService, rather than a separate App-JWT
 * service. The connector session exposes the token as an Authorization header
 * (`Bearer <token>` for OAuth); we strip the scheme and hand it to git as the
 * HTTPS password with the conventional `x-access-token` username (works for both
 * GitHub App installation tokens and OAuth user tokens).
 */
export function resolveGitCredentials(
  connectorSessions: Record<string, ConnectorSession | undefined> | undefined
): GitCredentials | undefined {
  const token = extractGithubToken(connectorSessions);
  if (!token) return undefined;
  return { token, username: 'x-access-token' };
}

function extractGithubToken(connectorSessions: Record<string, ConnectorSession | undefined> | undefined): string | undefined {
  const headers = connectorSessions?.github?.headers;
  if (!headers) return undefined;
  // Header names are case-sensitive in the session map; check both spellings.
  const authz = headers.Authorization ?? headers.authorization;
  if (typeof authz !== 'string' || !authz.trim()) return undefined;
  const match = authz.match(/^\s*(?:Bearer|token)\s+(.+?)\s*$/i);
  return (match ? match[1] : authz).trim() || undefined;
}
