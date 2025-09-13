/**
 * HttpRequest Class
 *
 * Executable HTTP request that handles external API calls using native fetch.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 */

import { HttpRequestParams } from '@/types';

export class HttpRequest {
  private params: HttpRequestParams;

  constructor(params: HttpRequestParams) {
    // Store HTTP request parameters with deep copy to avoid mutations
    this.params = {
      ...params,
      headers: params.headers ? { ...params.headers } : undefined,
    };
  }

  /**
   * Get request URL
   */
  getUrl(): string {
    return this.params.url;
  }

  /**
   * Get HTTP method
   */
  getMethod(): string | undefined {
    return this.params.method;
  }

  /**
   * Get request headers
   */
  getHeaders(): RequestInit['headers'] | undefined {
    return this.params.headers;
  }

  /**
   * Get request body
   */
  getBody(): RequestInit['body'] | undefined {
    return this.params.body;
  }

  /**
   * Get HTTP request parameters (read-only copy)
   */
  getParameters(): HttpRequestParams {
    return JSON.parse(JSON.stringify(this.params));
  }

  /**
   * Get request timeout
   */
  getTimeout(): number | undefined {
    return this.params.timeout;
  }

  /**
   * Execute the HTTP request
   */
  async execute(): Promise<{
    status: 'completed' | 'failed';
    data?: { status: number; statusText: string; headers: unknown; body: unknown; url: string | undefined };
    error?: Error;
  }> {
    try {
      console.log(`Executing HTTP ${this.params.method} request to: ${this.params.url}`);

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

      // Use the body directly from params (already in correct fetch format)
      let body = this.params.body;
      if (this.params.method !== 'GET' && this.params.method !== 'HEAD' && body) {
        // Only stringify if it's a plain object (not FormData, URLSearchParams, etc.)
        if (
          typeof body === 'object' &&
          !(body instanceof FormData) &&
          !(body instanceof URLSearchParams) &&
          !(body instanceof Blob) &&
          !(body instanceof ArrayBuffer) &&
          body !== null
        ) {
          body = JSON.stringify(body);
        }
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

      // Execute request
      const response = await fetch(this.params.url, fetchOptions);

      // Clear timeout
      clearTimeout(timeoutId);

      // Parse response body
      let responseBody: unknown;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
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
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: 'completed',
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          url: response.url,
        },
      };
    } catch (error) {
      // Create more descriptive error message with context
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = `Request timeout after ${this.params.timeout || 30000}ms`;
        } else {
          errorMessage = error.message;
        }
      }

      const contextualError = new Error(`HTTP ${this.params.method} request to ${this.params.url} failed: ${errorMessage}`);

      // Preserve original error as cause if possible
      if (error instanceof Error) {
        Object.defineProperty(contextualError, 'cause', { value: error, enumerable: false });
      }

      return {
        status: 'failed',
        error: contextualError,
      };
    }
  }

  /**
   * Validate HTTP request configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields validation
    if (!this.params.url) {
      errors.push('URL is required');
    }

    if (!this.params.method) {
      errors.push('HTTP method is required');
    }

    // URL format validation
    if (this.params.url) {
      try {
        new URL(this.params.url);
      } catch {
        errors.push('URL format is invalid');
      }
    }

    // Method validation
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (this.params.method && !validMethods.includes(this.params.method)) {
      errors.push(`Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`);
    }

    // Timeout validation
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push('Timeout should be at least 1000ms');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clone HTTP request with the same parameters
   */
  clone(): HttpRequest {
    const clonedParams: HttpRequestParams = {
      ...this.params,
    };

    return new HttpRequest(clonedParams);
  }

  /**
   * Update HTTP request parameters
   */
  updateParameters(updates: Partial<HttpRequestParams>): HttpRequest {
    const updatedParams = {
      ...this.params,
      ...updates,
    };

    return new HttpRequest(updatedParams);
  }
}
