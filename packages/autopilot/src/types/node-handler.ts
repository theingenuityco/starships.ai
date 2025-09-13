/**
 * Node NodeHandler Interface and Base Class
 *
 * Base interface and abstract class for workflow node handlers with lazy loading support
 */

import { NodeParameters, ValidationResult } from '@/types';
import { EventCallback } from '@/types/events';

/**
 * Base interface for workflow node handlers
 * Handlers are now instantiated with parameters via constructor
 */
export interface NodeHandler {
  /** Execute with parameters already injected via constructor */
  execute(): Promise<unknown>;

  /** Validate the handler's configuration */
  validate(): ValidationResult;
}

/**
 * Constructor type for handlers that accept the full node object
 */
export type NodeHandlerConstructor = new (params: NodeParameters, callback?: EventCallback) => NodeHandler;
