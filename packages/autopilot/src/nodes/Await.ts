/**
 * Await Node
 *
 * Declaratively requests an external await and pauses execution.
 *
 * The node emits an `await_requested` event with the resolved await request,
 * then marks the execution as paused. The Engine is responsible for:
 * - emitting `workflow_paused`
 * - setting `execution.currentNodeRef` to the next node so resume continues
 */

import { BaseNode } from './BaseNode';
import type { AwaitParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import type { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import type { AwaitRequestedEvent } from '@/types/events';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Await extends BaseNode<AwaitParams> {
  constructor(params: AwaitParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  async execute(_input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    const execution = this.getOptions()?.execution;
    if (!execution) {
      throw this.handleExecutionError(new Error('Execution context is required for await node'));
    }

    // Emit await_requested for hosting environments.
    try {
      const eventCallback = this.getEventCallback();
      if (eventCallback) {
        const executionDepth = typeof execution?.depth === 'number' ? execution.depth : 0;
        const event: AwaitRequestedEvent = {
          type: 'await_requested',
          timestamp: new Date().toISOString(),
          executionDepth,
          data: {
            nodeRef: String(execution.currentNodeRef || '').trim() || '__unknown__',
            kind: params.kind,
            spec: params.spec ?? {},
          },
        };
        await eventCallback(event);
      }
    } catch {
      // best-effort
    }

    // Pause execution. Engine loop will stop on status !== 'running'.
    execution.status = 'paused';

    // Record a placeholder output for this node; server will replace this node's output
    // with the awaited payload before resuming.
    return ExecutionItemUtils.wrapSingle({ kind: params.kind, spec: params.spec ?? {} });
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    if (!params || typeof params !== 'object') {
      errors.push({ code: 'INVALID_PARAMETERS', message: 'Parameters are required' });
      return { valid: false, errors };
    }

    const kind = (params as AwaitParams).kind;
    if (kind !== 'connector_event') {
      errors.push({ code: 'INVALID_PARAMETERS', message: 'kind must be "connector_event"' });
    }

    const spec = (params as AwaitParams).spec;
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      errors.push({ code: 'INVALID_PARAMETERS', message: 'spec must be an object' });
    } else {
      const s = spec as Record<string, unknown>;
      if ('provider' in s && s.provider !== undefined && s.provider !== null && typeof s.provider !== 'string') {
        errors.push({ code: 'INVALID_PARAMETERS', message: 'spec.provider must be a string when provided' });
      }
      if ('connectorId' in s && s.connectorId !== undefined && s.connectorId !== null && typeof s.connectorId !== 'string') {
        errors.push({ code: 'INVALID_PARAMETERS', message: 'spec.connectorId must be a string when provided' });
      }
      if ('eventTypes' in s && s.eventTypes !== undefined && s.eventTypes !== null) {
        if (!Array.isArray(s.eventTypes) || !(s.eventTypes as unknown[]).every((v) => typeof v === 'string' && v.length > 0)) {
          errors.push({ code: 'INVALID_PARAMETERS', message: 'spec.eventTypes must be a string[] when provided' });
        }
      }
    }

    return { valid: errors.length === 0, ...(errors.length > 0 ? { errors } : null) };
  }
}
