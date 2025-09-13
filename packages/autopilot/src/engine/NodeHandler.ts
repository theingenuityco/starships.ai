/**
 * Node NodeHandler Interface and Base Class
 *
 * Base interface and abstract class for workflow node handlers with lazy loading support
 */

import { NodeParameters, ValidationResult } from '@/types';
import { EventCallback } from '@/types/emitters';

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

// /**
//  * Abstract base class for handlers with common functionality
//  */
// export abstract class BaseHandler implements NodeHandler {
//   abstract readonly type: string;

//   constructor(protected node: WorkflowNode) {}

//   abstract execute(execution: Execution): Promise<Execution>;
//   abstract validate(): ValidationResult;
//   abstract getIcon(): string;

//   /**
//    * Helper to create successful result and push to execution results
//    */
//   protected createSuccessResult(execution: Execution, data: unknown): Execution {
//     const result: NodeResult = {
//       nodeRef: this.node.ref,
//       data,
//     };

//     execution.results.set(this.node.ref, result);
//     return execution;
//   }

//   /**
//    * Helper to create error result and push to execution results
//    */
//   protected createErrorResult(execution: Execution, error: string): Execution {
//     const result: NodeResult = {
//       nodeRef: this.node.ref,
//       error,
//     };

//     execution.results.set(this.node.ref, result);
//     return execution;
//   }

//   /**
//    * Helper to create validation error
//    */
//   protected createValidationError(code: ValidationErrorCode, message: string) {
//     return {
//       code,
//       message,
//       nodeRef: this.node.ref,
//       severity: 'error' as const,
//     };
//   }

//   /**
//    * Helper to create validation warning
//    */
//   protected createValidationWarning(code: ValidationWarningCode, message: string) {
//     return {
//       code,
//       message,
//       nodeRef: this.node.ref,
//     };
//   }
// }
