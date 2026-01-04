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

    // CRITICAL: Throw error for non-2xx responses to stop tool execution
    // This ensures that when child conversation creation is rejected (e.g., parent stopped),
    // the tool execution stops immediately instead of continuing and failing later
    if (response.status < 200 || response.status >= 300) {
      const snippet =
        typeof response.body === 'string'
          ? response.body.slice(0, 300)
          : (() => {
              try {
                return JSON.stringify(response.body).slice(0, 300);
              } catch {
                return '';
              }
            })();
      
      // Check if this is a stop-related error (conversation stopped)
      // Look for 409 status or error messages containing "stopped" or "aborted"
      const bodyStr = typeof response.body === 'string' 
        ? response.body 
        : (typeof response.body === 'object' && response.body !== null 
          ? JSON.stringify(response.body) 
          : String(response.body));
      
      // Check for stop-related indicators in the response
      let isStopError = 
        response.status === 409 || // Conflict (conversation stopped)
        bodyStr.includes('stopped') || 
        bodyStr.includes('aborted') ||
        bodyStr.includes('conversation_stopped');
      
      // Also check structured error response format: { error: { details: { reason: 'conversation_stopped' } } }
      if (!isStopError && typeof response.body === 'object' && response.body !== null) {
        const body = response.body as Record<string, unknown>;
        // Check response.body.reason (direct)
        if ('reason' in body && String(body.reason).includes('stopped')) {
          isStopError = true;
        }
        // Check response.body.error.details.reason (structured API error format)
        if ('error' in body && typeof body.error === 'object' && body.error !== null) {
          const error = body.error as Record<string, unknown>;
          if ('details' in error && typeof error.details === 'object' && error.details !== null) {
            const details = error.details as Record<string, unknown>;
            if ('reason' in details && String(details.reason).includes('stopped')) {
              isStopError = true;
            }
          }
        }
      }
      
      const errorMessage = `Connector action failed: ${connector}/${action} -> ${response.status} ${response.statusText}${
        snippet ? ` | body: ${snippet}` : ''
      }`;
      
      const error = new Error(errorMessage);
      // Mark stop-related errors as AbortError so tool execution stops immediately
      if (isStopError) {
        error.name = 'AbortError';
        console.log('[STOP-DEBUG] ConnectorAction: Detected stop-related error, throwing AbortError', {
          connector,
          action,
          status: response.status,
          isStopError,
        });
      }
      
      throw error;
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


