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

export interface NodeHandlerOptions {
  eventCallback?: EventCallback;
  execution?: Execution;
  /**
   * Non-secret runtime configuration values that may be safely exposed to
   * templates and user-authored code (Code/Mutate). Secrets MUST NOT be
   * placed here; they should only ever flow through server-side connector
   * execution.
   */
  runtimeConfig?: Record<string, unknown>;

  /**
   * Generic connector invocation hook.
   *
   * Autopilot does not know how connectors are stored or what secrets they
   * use. The host/server is responsible for looking up connector configuration
   * by slug, injecting credentials, performing the external call, and
   * returning a sanitized JSON result. Workflows never see secrets directly.
   */
  callConnector?: (args: {
    slug: string;
    payload: Record<string, unknown>;
  }) => Promise<unknown>;
}
/**
 * Constructor type for handlers that accept the full node object
 */
export type NodeHandlerConstructor = new (params: NodeParameters, options?: NodeHandlerOptions) => NodeHandler;
