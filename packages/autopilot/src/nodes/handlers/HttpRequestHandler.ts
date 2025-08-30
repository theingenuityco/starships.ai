/**
 * HTTP Request Node Handler
 * 
 * Handles HTTP request nodes for making external API calls using axios
 * Uses BaseHandler pattern
 */

import axios, { AxiosResponse, AxiosRequestConfig, AxiosError } from 'axios';
import { BaseHandler } from '../Handler';
import { ExecutionContext, ValidationResult, HttpRequestNodeParameters } from '../../types';

export class HttpRequestHandler extends BaseHandler {
  readonly type = 'http_request';
  private params: HttpRequestNodeParameters;

  constructor(parameters: any, nodeId: string) {
    super(parameters, nodeId);
    this.params = parameters as HttpRequestNodeParameters;
  }

  async execute(context: ExecutionContext) {
    const startTime = Date.now();
    
    try {
      // Build axios request configuration
      const requestConfig: AxiosRequestConfig = {
        method: this.params.method,
        url: this.params.url,
        headers: {
          'Content-Type': 'application/json',
          ...this.params.headers
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
          if (axios.isCancel(error) || 
              (error as AxiosError).code === 'ECONNABORTED') {
            break;
          }
          
          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }

      const duration = Date.now() - startTime;

      if (response) {
        return this.createSuccessResult({
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: response.data,
          url: response.config.url
        }, duration);
      } else {
        // If we get here, all retries failed
        return this.createErrorResult(
          lastError?.message || 'HTTP request failed',
          duration
        );
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      return this.createErrorResult((error as Error).message, duration);
    }
  }

  private addAuthentication(config: AxiosRequestConfig, auth: HttpRequestNodeParameters['authentication']) {
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
            password: auth.password
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

  validate(): ValidationResult {
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (!this.params.url) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'URL is required'
      ));
    }

    if (!this.params.method) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'HTTP method is required'
      ));
    }

    // URL format validation
    if (this.params.url) {
      try {
        new URL(this.params.url);
      } catch {
        errors.push(this.createValidationError(
          'INVALID_URL',
          'URL format is invalid'
        ));
      }
    }

    // Method validation
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (this.params.method && !validMethods.includes(this.params.method)) {
      errors.push(this.createValidationError(
        'INVALID_HTTP_METHOD',
        `Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`
      ));
    }

    // Authentication validation
    if (this.params.authentication) {
      const auth = this.params.authentication;
      switch (auth.type) {
        case 'bearer':
          if (!auth.token) {
            errors.push(this.createValidationError(
              'MISSING_AUTH_TOKEN',
              'Bearer token is required for bearer authentication'
            ));
          }
          break;
        case 'basic':
          if (!auth.username || !auth.password) {
            errors.push(this.createValidationError(
              'MISSING_AUTH_CREDENTIALS',
              'Username and password are required for basic authentication'
            ));
          }
          break;
        case 'api-key':
          if (!auth.apiKey || !auth.headerName) {
            errors.push(this.createValidationError(
              'MISSING_API_KEY',
              'API key and header name are required for API key authentication'
            ));
          }
          break;
      }
    }

    // Warnings for common issues
    if (this.params.timeout && this.params.timeout < 1000) {
      warnings.push(this.createValidationWarning(
        'LOW_TIMEOUT',
        'Timeout is very low, this may cause frequent failures'
      ));
    }

    if (this.params.retries && this.params.retries > 5) {
      warnings.push(this.createValidationWarning(
        'HIGH_RETRY_COUNT',
        'High retry count may cause long execution times'
      ));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: []
    };
  }

  getIcon(): string {
    return 'globe';
  }
}