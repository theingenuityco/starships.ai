/**
 * HttpRequest Class
 *
 * Executable HTTP request that handles external API calls using native fetch.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 */

import { HttpRequestParams, ValidationResult, ValidationError } from '@/types';
import { NodeHandler } from '@/types/node-handler';

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
  body: unknown;
  url: string;
}

export class HttpRequest implements NodeHandler {
  private params: HttpRequestParams;

  constructor(params: HttpRequestParams) {
    // Store HTTP request parameters with deep copy to avoid mutations
    this.params = {
      ...params,
      headers: params.headers ? { ...params.headers } : undefined,
    };
  }

  /**
   * Execute the HTTP request
   */
  async execute(): Promise<HttpResponse> {
    // Setup headers - convert HeadersInit to Record<string, string>
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.params.headers) {
      if (this.params.headers instanceof Headers) {
        // Convert Headers object to Record
        this.params.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(this.params.headers)) {
        // Convert [string, string][] to Record
        for (const [key, value] of this.params.headers) {
          headers[key] = value;
        }
      } else {
        // It's already a Record<string, string>
        headers = { ...headers, ...this.params.headers };
      }
    }

    // Setup timeout with AbortController
    const controller = new AbortController();
    const timeout = this.params.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Use the body directly from params (already in correct fetch format)
      let body = this.params.body;
      if (typeof body === 'object' && body !== null) {
        body = JSON.stringify(body);
      }

      // Build fetch options using all RequestInit properties from params
      const fetchOptions = {
        method: this.params.method,
        headers,
        body,
        signal: controller.signal,
        mode: this.params.mode,
        credentials: this.params.credentials,
        cache: this.params.cache,
        redirect: this.params.redirect || ('follow' as const),
        referrer: this.params.referrer,
        referrerPolicy: this.params.referrerPolicy,
        integrity: this.params.integrity,
        keepalive: this.params.keepalive,
      };

      try {
        // Execute request with proper error handling
        const response = await fetch(this.params.url, fetchOptions);

        // Handle HTTP error status codes
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        // Parse response body
        let responseBody: unknown;
        const contentType =
          response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') || '' : '';

        if (contentType.includes('application/json')) {
          try {
            responseBody = await response.json();
          } catch {
            responseBody = await response.text();
          }
        } else {
          responseBody = await response.text();
        }

        // Convert headers to object
        const responseHeaders: Record<string, string> = {};
        if (response.headers && typeof response.headers.forEach === 'function') {
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
        }

        return {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          url: response.url,
        };
      } catch (error) {
        // Handle fetch errors and timeout
        if (controller.signal.aborted) {
          throw new Error(`HTTP request timeout after ${timeout}ms`);
        }
        throw new Error(`HTTP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } finally {
      // Always clear timeout to prevent open handles
      clearTimeout(timeoutId);
    }
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
      try {
        new URL(this.params.url);
      } catch {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: 'URL format is invalid',
        });
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
