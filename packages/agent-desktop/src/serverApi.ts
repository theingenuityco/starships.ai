// Client for the Starship server REST API (bearer-JWT). Used by the desktop app
// to log in, list starships, register agent runtimes, mint runtime tokens, and
// manage the personas that run on a runtime.

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

export type AgentRuntimeKind = 'claude-code' | 'codex' | 'hermes' | 'openclaw' | 'custom';
export type AccessRole = 'viewer' | 'contributor';

/** The engine (an external CLI) registered on a starship. */
export interface AgentRuntime {
  id: string;
  starshipId: string;
  slug: string;
  name: string;
  kind: AgentRuntimeKind;
}

/** The user-authored actor that runs on a runtime. */
export interface AgentPersona {
  id: string;
  starshipId: string;
  slug: string;
  name: string;
  description?: string | null;
  accessRole: AccessRole;
  systemPrompt?: string | null;
  model?: string | null;
  instructions?: string | null;
  runtimeId?: string | null;
}

/** Append-only activity record attributed to a persona + runtime. */
export interface AgentRuntimeEvent {
  id: string;
  personaId?: string | null;
  runtimeId?: string | null;
  dispatchId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** A recurring heartbeat that periodically dispatches a command to a persona. */
export interface AgentHeartbeat {
  id: string;
  starshipId: string;
  personaId: string;
  name?: string | null;
  commandType: string;
  payload: Record<string, unknown>;
  intervalSeconds: number;
  enabled: boolean;
  lastFiredAt?: string | null;
  nextFireAt: string;
  createdAt: string;
  updatedAt: string;
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

// ---- Runtimes (engines) ----

export function listRuntimes(s: Session, starshipId: string): Promise<AgentRuntime[]> {
  return request<AgentRuntime[]>(s.serverUrl, `/starships/${starshipId}/agent-runtimes?limit=100`, { token: s.token });
}

export function createRuntime(s: Session, input: { starshipId: string; name: string; kind: AgentRuntimeKind }): Promise<AgentRuntime> {
  return request<AgentRuntime>(s.serverUrl, '/agent-runtimes', { method: 'POST', token: s.token, body: JSON.stringify(input) });
}

export async function mintToken(s: Session, starshipId: string, runtimeId: string, name?: string): Promise<{ token: string; tokenId: string }> {
  const data = await request<{ token: string; record: { id: string } }>(s.serverUrl, `/starships/${starshipId}/agent-runtime-tokens`, {
    method: 'POST',
    token: s.token,
    body: JSON.stringify({ runtimeId, ...(name ? { name } : {}) }),
  });
  return { token: data.token, tokenId: data.record.id };
}

/** Revoke a previously minted connection token (best-effort; owner-only server-side). */
export function revokeToken(s: Session, tokenId: string): Promise<void> {
  return request<void>(s.serverUrl, `/agent-runtime-tokens/${tokenId}`, { method: 'DELETE', token: s.token });
}

// ---- Personas (actors) ----

export function listPersonas(s: Session, starshipId: string): Promise<AgentPersona[]> {
  return request<AgentPersona[]>(s.serverUrl, `/starships/${starshipId}/agent-personas?limit=100`, { token: s.token });
}

export function createPersona(
  s: Session,
  input: {
    starshipId: string;
    name: string;
    accessRole?: AccessRole;
    systemPrompt?: string;
    model?: string;
    instructions?: string;
    runtimeId?: string | null;
  }
): Promise<AgentPersona> {
  return request<AgentPersona>(s.serverUrl, '/agent-personas', { method: 'POST', token: s.token, body: JSON.stringify(input) });
}

export function assignPersonaRuntime(s: Session, personaId: string, runtimeId: string | null): Promise<AgentPersona> {
  return request<AgentPersona>(s.serverUrl, `/agent-personas/${personaId}/runtime`, {
    method: 'PUT',
    token: s.token,
    body: JSON.stringify({ runtimeId }),
  });
}

export function deletePersona(s: Session, personaId: string): Promise<void> {
  return request<void>(s.serverUrl, `/agent-personas/${personaId}`, { method: 'DELETE', token: s.token });
}

export function personaActivity(s: Session, personaId: string, limit = 50): Promise<AgentRuntimeEvent[]> {
  return request<AgentRuntimeEvent[]>(s.serverUrl, `/agent-personas/${personaId}/activity?limit=${limit}`, { token: s.token });
}

/** Whole-starship activity log (most recent first), across every persona and runtime. */
export function listStarshipEvents(s: Session, starshipId: string, limit = 200): Promise<AgentRuntimeEvent[]> {
  return request<AgentRuntimeEvent[]>(s.serverUrl, `/starships/${starshipId}/agent-events?limit=${limit}`, { token: s.token });
}

// ---- Heartbeats (recurring dispatches) ----

export function listHeartbeats(s: Session, starshipId: string, personaId: string): Promise<AgentHeartbeat[]> {
  return request<AgentHeartbeat[]>(s.serverUrl, `/starships/${starshipId}/agent-personas/${personaId}/heartbeats`, { token: s.token });
}

export function createHeartbeat(
  s: Session,
  starshipId: string,
  personaId: string,
  input: { name?: string; commandType: string; payload?: Record<string, unknown>; intervalSeconds: number; enabled?: boolean }
): Promise<AgentHeartbeat> {
  return request<AgentHeartbeat>(s.serverUrl, `/starships/${starshipId}/agent-personas/${personaId}/heartbeats`, {
    method: 'POST',
    token: s.token,
    body: JSON.stringify(input),
  });
}

export function updateHeartbeat(
  s: Session,
  id: string,
  input: { name?: string | null; commandType?: string; payload?: Record<string, unknown>; intervalSeconds?: number; enabled?: boolean }
): Promise<AgentHeartbeat> {
  return request<AgentHeartbeat>(s.serverUrl, `/agent-runtime-heartbeats/${id}`, { method: 'PUT', token: s.token, body: JSON.stringify(input) });
}

export function deleteHeartbeat(s: Session, id: string): Promise<void> {
  return request<void>(s.serverUrl, `/agent-runtime-heartbeats/${id}`, { method: 'DELETE', token: s.token });
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
