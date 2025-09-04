/**
 * HttpRequest Class
 *
 * Executable HTTP request that handles external API calls using axios.
 * Follows the same pattern as Workflow and Agent classes for consistency.
 */

import axios, { AxiosResponse, AxiosRequestConfig, AxiosError } from 'axios';
import { HttpRequestNodeParameters } from '@/types';

export class HttpRequest {
  private params: HttpRequestNodeParameters;

  constructor(params: HttpRequestNodeParameters) {
    // Store HTTP request parameters with deep copy to avoid mutations
    this.params = {
      ...params,
      headers: { ...params.headers },
      authentication: params.authentication ? { ...params.authentication } : undefined,
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
  getMethod(): string {
    return this.params.method;
  }

  /**
   * Get request headers
   */
  getHeaders(): Record<string, string> | undefined {
    return this.params.headers ? { ...this.params.headers } : undefined;
  }

  /**
   * Get request body
   */
  getBody(): string | object | undefined {
    return this.params.body;
  }

  /**
   * Get HTTP request parameters (read-only copy)
   */
  getParameters(): HttpRequestNodeParameters {
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
  async execute(): Promise<{ status: 'completed' | 'failed'; data?: any; error?: Error }> {
    try {
      console.log(`Executing HTTP ${this.params.method} request to: ${this.params.url}`);

      // Build axios request configuration
      const requestConfig: AxiosRequestConfig = {
        method: this.params.method,
        url: this.params.url,
        headers: {
          'Content-Type': 'application/json',
          ...this.params.headers,
        },
        timeout: this.params.timeout || 30000,
        maxRedirects: this.params.followRedirects !== false ? 5 : 0,
        validateStatus: () => true, // Don't throw on any status code
      };

      // Add authentication if provided
      if (this.params.authentication) {
        this.addAuthentication(requestConfig, this.params.authentication);
      }

      // Add body for non-GET requests
      if (this.params.method !== 'GET' && this.params.method !== 'HEAD' && this.params.body) {
        requestConfig.data = this.params.body;
      }

      // Execute request with retries
      const maxRetries = this.params.retries || 0;
      let lastError: Error | null = null;
      let response: AxiosResponse | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await axios(requestConfig);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as AxiosError;

          // Don't retry on certain errors
          if (axios.isCancel(error) || (error as AxiosError).code === 'ECONNABORTED') {
            break;
          }

          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }

      if (response) {
        return {
          status: 'completed',
          data: {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: response.data,
            url: response.config.url,
          },
        };
      } else {
        // If we get here, all retries failed
        const errorMessage = lastError?.message || 'HTTP request failed';
        return {
          status: 'failed',
          error: new Error(`HTTP request failed: ${errorMessage}`),
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'failed',
        error: new Error(`HTTP request execution failed: ${errorMessage}`),
      };
    }
  }

  /**
   * Add authentication to request configuration
   */
  private addAuthentication(
    config: AxiosRequestConfig,
    auth: HttpRequestNodeParameters['authentication']
  ) {
    if (!auth || !config.headers) return;

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          config.headers['Authorization'] = `Bearer ${auth.token}`;
        }
        break;
      case 'basic':
        if (auth.username && auth.password) {
          config.auth = {
            username: auth.username,
            password: auth.password,
          };
        }
        break;
      case 'api-key':
        if (auth.apiKey && auth.headerName) {
          config.headers[auth.headerName] = auth.apiKey;
        }
        break;
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

    // Authentication validation
    if (this.params.authentication) {
      const auth = this.params.authentication;
      switch (auth.type) {
        case 'bearer':
          if (!auth.token) {
            errors.push('Bearer token is required for bearer authentication');
          }
          break;
        case 'basic':
          if (!auth.username || !auth.password) {
            errors.push('Username and password are required for basic authentication');
          }
          break;
        case 'api-key':
          if (!auth.apiKey || !auth.headerName) {
            errors.push('API key and header name are required for API key authentication');
          }
          break;
      }
    }

    // Timeout validation
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push('Timeout should be at least 1000ms');
    }

    // Retries validation
    if (this.params.retries !== undefined && this.params.retries < 0) {
      errors.push('Retries must be non-negative');
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
    const clonedParams: HttpRequestNodeParameters = {
      ...this.params,
      headers: this.params.headers ? { ...this.params.headers } : undefined,
      authentication: this.params.authentication ? { ...this.params.authentication } : undefined,
    };

    return new HttpRequest(clonedParams);
  }

  /**
   * Update HTTP request parameters
   */
  updateParameters(updates: Partial<HttpRequestNodeParameters>): HttpRequest {
    const updatedParams = {
      ...this.params,
      ...updates,
      // Merge headers if both exist
      headers: {
        ...this.params.headers,
        ...updates.headers,
      },
      // Use new authentication if provided, otherwise keep existing
      authentication: updates.authentication || this.params.authentication,
    };

    return new HttpRequest(updatedParams);
  }
}
