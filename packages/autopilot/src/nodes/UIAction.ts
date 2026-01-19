/**
 * UIAction Node
 *
 * Declaratively emits a UI action.
 *
 * Node surface is intentionally protocol-agnostic:
 * - `action`: string (required)
 * - `payload`: object (optional)
 */

import { BaseNode } from './BaseNode';
import type { UIActionParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import type { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import type { UIActionEvent } from '@/types/events';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { Eval } from '@/engine/Eval';

export class UIAction extends BaseNode<UIActionParams> {
  private eval = new Eval();

  constructor(params: UIActionParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    const execution = this.getOptions()?.execution;
    if (!execution) {
      throw this.handleExecutionError(new Error('Execution context is required for ui_action node'));
    }

    const inputData = ExecutionItemUtils.unwrapSingle(input);

    // Resolve templates in action + payload using the same Eval engine used elsewhere.
    const resolvedAction = (await this.eval.resolveTemplates(params.action, execution, inputData, {
      stringEvaluationMode: 'full-only',
    })) as unknown;
    const resolvedPayload = params.payload
      ? ((await this.eval.resolveTemplates(params.payload, execution, inputData, {
          stringEvaluationMode: 'full-only',
        })) as unknown)
      : {};

    if (typeof resolvedAction !== 'string' || resolvedAction.trim().length === 0) {
      throw this.handleExecutionError(new Error('ui_action action must resolve to a non-empty string'));
    }

    if (!resolvedPayload || typeof resolvedPayload !== 'object' || Array.isArray(resolvedPayload)) {
      throw this.handleExecutionError(new Error('ui_action payload must resolve to an object'));
    }
    const payloadRec = resolvedPayload as Record<string, unknown>;

    const action = resolvedAction.trim();

    // Emit a first-class Autopilot event for hosting environments (e.g., server) to forward.
    try {
      const eventCallback = this.getEventCallback();
      if (eventCallback) {
        const executionDepth = typeof execution?.depth === 'number' ? execution.depth : 0;
        const event: UIActionEvent = {
          type: 'ui_action',
          timestamp: new Date().toISOString(),
          executionDepth,
          data: { action, ...(Object.keys(payloadRec).length > 0 ? { payload: payloadRec } : null) },
        };
        await eventCallback(event);
      }
    } catch {
      // Best-effort only: never fail the workflow just because UI signaling failed.
    }

    // Keep node output generic too (useful for chaining or debugging).
    return ExecutionItemUtils.wrapSingle({ action, payload: payloadRec }, input?.[0]);
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    if (!params || typeof params !== 'object') {
      errors.push({ code: 'INVALID_PARAMETERS', message: 'Parameters are required' });
      return { valid: false, errors };
    }

    if (!('action' in params)) {
      errors.push({ code: 'MISSING_REQUIRED_FIELD', message: 'action is required' });
    } else {
      const action = (params as UIActionParams).action;
      if (typeof action !== 'string' || action.trim().length === 0) {
        errors.push({ code: 'INVALID_PARAMETERS', message: 'action must be a non-empty string' });
      }
    }

    if ('payload' in params) {
      const payload = (params as UIActionParams).payload;
      if (payload !== undefined && (!payload || typeof payload !== 'object' || Array.isArray(payload))) {
        errors.push({ code: 'INVALID_PARAMETERS', message: 'payload must be an object when provided' });
      }
    }

    // Validate template expressions if present.
    try {
      const p = params as UIActionParams;
      if (this.eval.hasTemplateExpressions(p.action)) {
        const v = this.eval.validateTemplateExpressions(p.action, { stringEvaluationMode: 'full-only' });
        if (!v.valid && Array.isArray(v.errors) && v.errors.length > 0) errors.push(...v.errors);
      }
      if (p.payload && this.eval.hasTemplateExpressions(p.payload)) {
        const v = this.eval.validateTemplateExpressions(p.payload, { stringEvaluationMode: 'full-only' });
        if (!v.valid && Array.isArray(v.errors) && v.errors.length > 0) errors.push(...v.errors);
      }
    } catch {
      // ignore template validation failures here; runtime will still validate output shape
    }

    return { valid: errors.length === 0, ...(errors.length > 0 ? { errors } : null) };
  }
}
