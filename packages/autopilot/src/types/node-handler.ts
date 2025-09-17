/**
 * Node NodeHandler Interface and Base Class
 *
 * Base interface and abstract class for workflow node handlers with lazy loading support
 */

import { NodeParameters, ValidationResult, ExecutionItem } from '@/types';
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
}
/**
 * Constructor type for handlers that accept the full node object
 */
export type NodeHandlerConstructor = new (params: NodeParameters, options?: NodeHandlerOptions) => NodeHandler;
