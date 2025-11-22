/**
 * Node NodeHandler Interface and Base Class
 *
 * Base interface and abstract class for workflow node handlers with lazy loading support
 */

import { Execution, NodeParameters, ValidationResult, ExecutionItem } from '@/types';
import { EventCallback } from '@/types/events';

/**
 * Base interface for workflow node handlers
 * Handlers are now instantiated with parameters via constructor
 */

export interface NodeHandler {
  /** Execute with parameters already injected via constructor and optional input items */
  execute(input?: ExecutionItem[]): Promise<ExecutionItem[]>;

  /** Validate the handler's configuration */
  validate(): ValidationResult;
}

/**
 * HostRuntime
 *
 * Typed surface provided by the embedding host/server to perform side-effecting
 * operations (HTTP, etc.). Workflows never talk to the network directly; they
 * delegate via this interface so the host can own secrets, policies, and
 * observability.
 */
export interface HostRuntime {
  /**
   * HTTP execution entrypoint.
   *
   * All HTTP performed by Autopilot nodes should flow through this method.
   * When connectorSlug is provided, the host may resolve connector records,
   * inject secrets, and apply connector-specific policies before performing
   * the actual request.
   */
  http(request: {
    method: string;
    url: string;
    headers?: Record<string, unknown>;
    body?: unknown;
    timeoutMs?: number;
    connectorSlug?: string;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
    body: unknown;
    url: string;
  }>;
}

export interface NodeHandlerOptions {
  eventCallback?: EventCallback;
  execution?: Execution;
  /**
   * Non-secret runtime environment values that may be safely exposed to
   * templates and user-authored code (Code/Mutate). Secrets MUST NOT be
   * placed here; they should only ever flow through server-side connector
   * execution.
   */
  runtimeEnv?: Record<string, unknown>;
  /**
   * Host-provided runtime surface for side-effecting operations (HTTP, etc.).
   * This replaces the legacy callConnector hook with a typed interface.
   */
  hostRuntime?: HostRuntime;
}
/**
 * Constructor type for handlers that accept the full node object
 */
export type NodeHandlerConstructor = new (params: NodeParameters, options?: NodeHandlerOptions) => NodeHandler;
