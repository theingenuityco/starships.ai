/**
 * ConnectorAction Node
 *
 * Executes a connector template endpoint (action) via HostRuntime.connectorAction.
 */

import type { NodeHandler, NodeHandlerOptions } from '@/types/node-handler';
import type { ConnectorActionParams, ExecutionItem, ValidationErrorCode, ValidationResult } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class ConnectorAction implements NodeHandler {
  private params: ConnectorActionParams;
  private options?: NodeHandlerOptions;

  constructor(params: ConnectorActionParams, options?: NodeHandlerOptions) {
    this.params = structuredClone(params);
    this.options = options;
  }

  private static errorMessageFromResponseBody(body: unknown, status: unknown): string {
    // Best-effort extraction of a useful message across our common API shapes:
    // - { success:false, error:{ message } }
    // - { error: "Not Found" }
    // - { error:{ message } }
    // - { message }
    if (body && typeof body === 'object') {
      const anyBody = body as Record<string, unknown>;
      if (typeof anyBody.error === 'string' && anyBody.error.trim().length > 0) return anyBody.error;
      const err = (anyBody.error && typeof anyBody.error === 'object' ? (anyBody.error as Record<string, unknown>) : null) ?? null;
      const msg =
        (err && typeof err.message === 'string' ? err.message : null) ??
        (typeof anyBody.message === 'string' ? anyBody.message : null);
      if (msg) return msg;
    }
    return 'Request failed (' + String(status) + ')';
  }

  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const runtime = this.options?.hostRuntime;
    if (!runtime || typeof runtime.connectorAction !== 'function') {
      throw new Error('Host runtime connectorAction() not available for ConnectorAction node');
    }

    const connector = String(this.params.connector || '').trim();
    const action = String(this.params.action || '').trim();
    if (!connector) throw new Error('connector is required for ConnectorAction node');
    if (!action) throw new Error('action is required for ConnectorAction node');

    const timeoutMs = this.params.timeout || 30000;
    const args = this.params.args ?? (input?.[0]?.json as Record<string, unknown> | undefined) ?? {};

    const response = await runtime.connectorAction({
      connector,
      action,
      args,
      timeoutMs,
    });

    if (this.params.failOnNon2xx === true) {
      const status = response?.status;
      if (typeof status === 'number' && (status < 200 || status >= 300)) {
        const err = new Error(ConnectorAction.errorMessageFromResponseBody(response?.body, status));
        // Preserve rich context for upstream error handlers (Tool node, Engine, server-tools wrapper).
        // This is especially important in hosted tool execution where the UI/LLM needs actionable
        // diagnostics beyond a single message string.
        (err as unknown as { cause?: unknown }).cause = {
          status: response?.status,
          statusText: response?.statusText,
          headers: response?.headers,
          body: response?.body,
          url: response?.url,
        };
        throw err;
      }
    }

    return ExecutionItemUtils.wrapSingle(
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.body,
        url: response.url,
      },
      input?.[0]
    );
  }

  validate(): ValidationResult {
    const errors: Array<{ code: ValidationErrorCode; message: string }> = [];
    if (!this.params.connector) errors.push({ code: 'MISSING_REQUIRED_FIELD', message: 'connector is required' });
    if (!this.params.action) errors.push({ code: 'MISSING_REQUIRED_FIELD', message: 'action is required' });
    if (errors.length === 0) return { valid: true };
    return { valid: false, errors };
  }
}


