/**
 * HttpRequest Class
 *
 * Executable HTTP request that handles external API calls using native fetch.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 */

import { HttpRequestParams, ValidationResult, ValidationError, ExecutionItem } from '@/types';
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

    // Use input data as body if available and no explicit body set
    const inputData = ExecutionItemUtils.unwrapSingle(input);
    const method = (this.params.method || 'GET').toUpperCase();
    const bodyData = this.params.body !== undefined ? this.params.body : inputData;

    // Normalize headers into a plain record
    let headers: Record<string, unknown> = {};
    if (this.params.headers) {
      if (this.params.headers instanceof Headers) {
        const tmp: Record<string, string> = {};
        this.params.headers.forEach((value, key) => {
          tmp[key] = value;
        });
        headers = tmp;
      } else if (Array.isArray(this.params.headers)) {
        const tmp: Record<string, string> = {};
        for (const [key, value] of this.params.headers) {
          tmp[key] = value;
        }
        headers = tmp;
      } else {
        headers = { ...(this.params.headers as Record<string, unknown>) };
      }
    }

    const timeoutMs = this.params.timeout || 30000;

    const response = await runtime.http({
      method,
      url: this.params.url,
      headers,
      body: bodyData ?? undefined,
      timeoutMs,
      connectorSlug: this.params.connectorSlug,
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

      // When using connectors, relative URLs (e.g. "/starships/self/tools") are valid and
      // should be resolved by the HostRuntime/http connector layer. Only enforce strict
      // URL parsing for absolute URLs with an explicit scheme.
      const isAbsolute = typeof urlValue === 'string' && /^https?:\/\//i.test(urlValue);

      if (isAbsolute) {
        try {
          // Validate absolute URL format
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
