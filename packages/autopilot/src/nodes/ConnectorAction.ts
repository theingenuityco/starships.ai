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


