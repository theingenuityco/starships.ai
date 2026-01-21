/**
 * HttpRequest Class
 *
 * Executable HTTP request that handles external API calls using native fetch.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 */

import { HttpRequestParams, ValidationResult, ValidationError, ExecutionItem, BinaryPayload } from '@/types';
import { NodeHandler, NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
  body: unknown;
  url: string;
}

export class HttpRequest implements NodeHandler {
  private params: HttpRequestParams;
  private options?: NodeHandlerOptions;

  constructor(params: HttpRequestParams, options?: NodeHandlerOptions) {
    // Store HTTP request parameters with deep copy to avoid mutations
    this.params = {
      ...params,
      headers: params.headers ? { ...params.headers } : undefined,
    };
    this.options = options;
  }

  /**
   * Execute the HTTP request with optional input items
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const runtime = this.options?.hostRuntime;
    if (!runtime || typeof runtime.http !== 'function') {
      throw new Error('Host runtime http() not available for HttpRequest node');
    }

    const method = (this.params.method || 'GET').toUpperCase();
    let bodyData: unknown;
    // Use local headers so we don't mutate node params during execution.
    let headersParam: HttpRequestParams['headers'] = this.params.headers;

    // Body selection rules:
    // - GET/HEAD => never send a body, even if provided
    // - If bodyFromBinaryKey is set => use input[0].binary[key] as raw body
    // - Other methods => only use explicitly configured body; upstream input is ignored
    if (method === 'GET' || method === 'HEAD') {
      bodyData = undefined;
    } else if (typeof this.params.bodyFromBinaryKey === 'string' && this.params.bodyFromBinaryKey.trim().length > 0) {
      const key = this.params.bodyFromBinaryKey.trim();
      const payload = input?.[0]?.binary?.[key] as BinaryPayload | undefined;
      if (!payload || payload.kind !== 'bytes' || !(payload.data instanceof ArrayBuffer)) {
        throw new Error(`HttpRequest missing binary payload for key "${key}"`);
      }
      bodyData = payload.data;

      // Best-effort content-type propagation: only set if caller hasn't specified it already.
      const currentHeaders = new Headers(headersParam as unknown as HeadersInit);
      if (payload.contentType && !currentHeaders.has('content-type')) {
        currentHeaders.set('content-type', payload.contentType);
        headersParam = currentHeaders as unknown as HttpRequestParams['headers'];
      }
    } else if (this.params.body !== undefined) {
      bodyData = this.params.body;
    } else {
      bodyData = undefined;
    }

    // Normalize headers into a plain record
    let headers: Record<string, unknown> = {};
    if (headersParam) {
      if (headersParam instanceof Headers) {
        const tmp: Record<string, string> = {};
        headersParam.forEach((value, key) => {
          tmp[key] = value;
        });
        headers = tmp;
      } else if (Array.isArray(headersParam)) {
        const tmp: Record<string, string> = {};
        for (const [key, value] of headersParam) {
          tmp[key] = value;
        }
        headers = tmp;
      } else {
        headers = { ...(headersParam as Record<string, unknown>) };
      }
    }

    const timeoutMs = this.params.timeout || 30000;

    const response = await runtime.http({
      method,
      url: this.params.url,
      headers,
      body: bodyData ?? undefined,
      timeoutMs,
      responseType: this.params.responseType,
    });

    const httpResponse: HttpResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body,
      url: response.url,
    };

    // Fail the workflow on non-2xx responses
    if (httpResponse.status < 200 || httpResponse.status >= 300) {
      const snippet =
        typeof httpResponse.body === 'string'
          ? httpResponse.body.slice(0, 300)
          : (() => {
              try {
                return JSON.stringify(httpResponse.body).slice(0, 300);
              } catch {
                return '';
              }
            })();
      throw new Error(
        `HTTP request failed: ${method} ${this.params.url} -> ${httpResponse.status} ${httpResponse.statusText}${
          snippet ? ` | body: ${snippet}` : ''
        }`
      );
    }

    // Optional: store binary response payload in ExecutionItem.binary.
    if (this.params.responseType === 'arrayBuffer') {
      const key = (typeof this.params.binaryKey === 'string' && this.params.binaryKey.trim().length > 0 ? this.params.binaryKey.trim() : 'data') as string;
      const ab = response.body;
      if (!(ab instanceof ArrayBuffer)) {
        throw new Error('Host runtime returned non-ArrayBuffer body for responseType=arrayBuffer');
      }
      const contentType =
        typeof (response.headers as Record<string, unknown>)?.['content-type'] === 'string'
          ? String((response.headers as Record<string, unknown>)['content-type'])
          : typeof (response.headers as Record<string, unknown>)?.['Content-Type'] === 'string'
            ? String((response.headers as Record<string, unknown>)['Content-Type'])
            : undefined;

      const out: ExecutionItem[] = ExecutionItemUtils.wrapSingle(
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: undefined,
          url: response.url,
        },
        input?.[0]
      );
      out[0].binary = {
        ...(out[0].binary ?? {}),
        [key]: { kind: 'bytes', data: ab, contentType, sizeBytes: ab.byteLength } satisfies BinaryPayload,
      };
      return out;
    }

    return ExecutionItemUtils.wrapSingle(httpResponse, input?.[0]);
  }

  /**
   * Validate HTTP request configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Required fields validation
    if (!this.params.url) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'URL is required',
      });
    }

    if (!this.params.method) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'HTTP method is required',
      });
    }

    // URL format validation
    if (this.params.url) {
      const urlValue = this.params.url;

      // HttpRequest is raw HTTP; require absolute URLs with scheme to avoid
      // hidden baseUrl behavior (connectors are handled by connector_action).
      const isAbsolute = typeof urlValue === 'string' && /^https?:\/\//i.test(urlValue);
      if (!isAbsolute) {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: 'URL must be an absolute http(s) URL (use connector_action for connector-backed relative paths)',
        });
      } else {
        try {
          new URL(urlValue);
        } catch {
          errors.push({
            code: 'INVALID_PARAMETERS',
            message: 'URL format is invalid',
          });
        }
      }
    }

    // Method validation
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (this.params.method && !validMethods.includes(this.params.method)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: `Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`,
      });
    }

    // Timeout validation
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Timeout should be at least 1000ms',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
