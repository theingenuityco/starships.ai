/**
 * Code-action framework — types.
 *
 * A connector action is a plain function: `run(args, ctx)`. It builds and sends its
 * HTTP request through `ctx.http` (a client pre-bound with the connector baseUrl and
 * the resolved auth/session headers) and returns the response envelope. There is no
 * template DSL and no `eval`; request shaping is ordinary TypeScript.
 *
 * `parameters` is the JSON Schema surfaced to the LLM tool layer + the connect/catalog
 * UI. Hand-authored actions derive it from a Zod schema via `defineAction`; mechanically
 * lifted actions may carry a JSON Schema directly.
 */

import type { HttpMethod } from '@starships/protocol';

/** Normalized HTTP response, identical to the host runtime `http()`/`connectorAction()` return. */
export interface HttpEnvelope {
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
  body: unknown;
  url: string;
}

export interface HttpRequestOptions {
  /** Query params; values are standard-encoded and undefined/null are dropped. */
  query?: Record<string, unknown>;
  /** Pre-built query string appended verbatim (no encoding). Use when an API needs raw values. */
  rawQuery?: string;
  headers?: Record<string, unknown>;
  body?: unknown;
  timeoutMs?: number;
  responseType?: 'json' | 'text' | 'arrayBuffer' | 'base64';
}

/**
 * Authed HTTP client handed to an action. `path` is resolved against the connector's
 * effective base URL; session/auth headers are already applied by the executor.
 */
export interface AuthedHttp {
  request(method: string, path: string, opts?: HttpRequestOptions): Promise<HttpEnvelope>;
  get(path: string, opts?: HttpRequestOptions): Promise<HttpEnvelope>;
  post(path: string, opts?: HttpRequestOptions): Promise<HttpEnvelope>;
  put(path: string, opts?: HttpRequestOptions): Promise<HttpEnvelope>;
  patch(path: string, opts?: HttpRequestOptions): Promise<HttpEnvelope>;
  delete(path: string, opts?: HttpRequestOptions): Promise<HttpEnvelope>;
}

/** Everything an action needs at call time, injected by the server-side executor. */
export interface ActionContext {
  http: AuthedHttp;
  runtimeEnv: Record<string, unknown>;
  metadata: Record<string, unknown>;
  starshipId: string;
  signal?: AbortSignal;
}

/**
 * A code-driven connector action. The executor finds it by `name`, validates `args`
 * with `parse` (when present), and calls `run`. `parameters` is the tool/catalog schema.
 */
export interface CodeAction {
  name: string;
  description: string;
  /** Informational, for the tool/catalog schema only — execution lives in `run`. */
  method?: HttpMethod;
  path?: string;
  parameters: Record<string, unknown>;
  /** Optional argument validation/coercion (Zod-backed for hand-authored actions). */
  parse?(args: unknown): Record<string, unknown>;
  run(args: Record<string, unknown>, ctx: ActionContext): Promise<HttpEnvelope | unknown>;
}
