// Client for the Starship server REST API (bearer-JWT). Used by the desktop
// app to log in, list starships/agents, register agents, and mint tokens.

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  serverUrl: string; // e.g. http://localhost:4000
  token: string; // JWT
  user: User;
}

export interface Starship {
  id: string;
  slug: string;
  name: string;
}

export type AgentKind = 'claude-code' | 'codex' | 'hermes' | 'openclaw' | 'custom';

export interface Agent {
  id: string;
  starshipId: string;
  slug: string;
  name: string;
  kind: AgentKind;
  accessRole: 'viewer' | 'contributor';
}

const base = (serverUrl: string) => `${serverUrl.replace(/\/$/, '')}/api/v1`;

async function request<T>(serverUrl: string, path: string, opts: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${base(serverUrl)}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body.data as T;
}

export async function login(serverUrl: string, email: string, password: string): Promise<{ user: User; token: string; starship: Starship | null }> {
  const data = await request<{ user: User; token: string; starship: Starship | null }>(serverUrl, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data;
}

export function listStarships(s: Session): Promise<Starship[]> {
  return request<Starship[]>(s.serverUrl, `/users/${s.user.id}/starships?limit=100`, { token: s.token });
}

export function listAgents(s: Session, starshipId: string): Promise<Agent[]> {
  return request<Agent[]>(s.serverUrl, `/starships/${starshipId}/agents?limit=100`, { token: s.token });
}

export function createAgent(
  s: Session,
  input: { starshipId: string; name: string; kind: AgentKind; accessRole?: 'viewer' | 'contributor'; description?: string }
): Promise<Agent> {
  return request<Agent>(s.serverUrl, '/agents', { method: 'POST', token: s.token, body: JSON.stringify(input) });
}

export function mintToken(s: Session, starshipId: string, agentId: string, name?: string): Promise<{ token: string }> {
  return request<{ token: string }>(s.serverUrl, `/starships/${starshipId}/agent-tokens`, {
    method: 'POST',
    token: s.token,
    body: JSON.stringify({ agentId, ...(name ? { name } : {}) }),
  });
}

/** Derive the MCP endpoint from the server URL: same host, port 4100, /mcp. */
export function deriveMcpUrl(serverUrl: string): string {
  try {
    const u = new URL(serverUrl);
    return `${u.protocol}//${u.hostname}:4100/mcp`;
  } catch {
    return 'http://localhost:4100/mcp';
  }
}
