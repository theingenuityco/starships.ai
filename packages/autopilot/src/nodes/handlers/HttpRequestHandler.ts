/**
 * HTTP Request Node Handler
 * 
 * Handles HTTP request nodes for making external API calls using axios
 * Uses BaseHandler pattern
 */

import axios, { AxiosResponse, AxiosRequestConfig, AxiosError } from 'axios';
import { BaseHandler } from '../Handler';
import { Execution, ValidationResult, HttpRequestNodeParameters, ValidationError, ValidationWarning } from '../../types';

export class HttpRequestHandler extends BaseHandler {
  readonly type = 'http_request';

  async execute(execution: Execution) {
    const startTime = Date.now();
    const params = this.node.parameters as HttpRequestNodeParameters;
    
    try {
      // Build axios request configuration
      const requestConfig: AxiosRequestConfig = {
        method: params.method,
        url: params.url,
        headers: {
          'Content-Type': 'application/json',
          ...params.headers
        },
        timeout: params.timeout || 30000,
        maxRedirects: params.followRedirects !== false ? 5 : 0,
        validateStatus: () => true, // Don't throw on any status code
      };

      // Add authentication if provided
      if (params.authentication) {
        this.addAuthentication(requestConfig, params.authentication);
      }

      // Add body for non-GET requests
      if (params.method !== 'GET' && params.method !== 'HEAD' && params.body) {
        requestConfig.data = params.body;
      }

      // Execute request with retries
      const maxRetries = params.retries || 0;
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
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as HttpRequestNodeParameters;

    // Required fields validation
    if (!params.url) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'URL is required'
      ));
    }

    if (!params.method) {
      errors.push(this.createValidationError(
        'MISSING_REQUIRED_FIELD',
        'HTTP method is required'
      ));
    }

    // URL format validation
    if (params.url) {
      try {
        new URL(params.url);
      } catch {
        errors.push(this.createValidationError(
          'INVALID_PARAMETERS',
          'URL format is invalid'
        ));
      }
    }

    // Method validation
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (params.method && !validMethods.includes(params.method)) {
      errors.push(this.createValidationError(
        'INVALID_PARAMETERS',
        `Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`
      ));
    }

    // Authentication validation
    if (params.authentication) {
      const auth = params.authentication;
      switch (auth.type) {
        case 'bearer':
          if (!auth.token) {
            errors.push(this.createValidationError(
              'MISSING_REQUIRED_FIELD',
              'Bearer token is required for bearer authentication'
            ));
          }
          break;
        case 'basic':
          if (!auth.username || !auth.password) {
            errors.push(this.createValidationError(
              'MISSING_REQUIRED_FIELD',
              'Username and password are required for basic authentication'
            ));
          }
          break;
        case 'api-key':
          if (!auth.apiKey || !auth.headerName) {
            errors.push(this.createValidationError(
              'MISSING_REQUIRED_FIELD',
              'API key and header name are required for API key authentication'
            ));
          }
          break;
      }
    }

    // Warnings for common issues
    if (params.timeout && params.timeout < 1000) {
      warnings.push(this.createValidationWarning(
        'POTENTIAL_TIMEOUT',
        'Timeout is very low, this may cause frequent failures'
      ));
    }

    if (params.retries && params.retries > 5) {
      warnings.push(this.createValidationWarning(
        'POTENTIAL_TIMEOUT',
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