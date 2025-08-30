/**
 * HTTP Request Node Handler
 * 
 * Handles HTTP request nodes for making external API calls using axios
 */

import axios, { AxiosResponse, AxiosRequestConfig, AxiosError } from 'axios';
import { Handler } from '../Handler';
import { Node, NodeResult, ExecutionContext, ValidationResult, HttpRequestNodeParameters } from '../../types';

export class HttpRequestHandler implements Handler {
  readonly type = 'http_request';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    const params = node.parameters as unknown as HttpRequestNodeParameters;
    const startTime = Date.now();
    
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
        return {
          nodeId: node.id,
          success: response.status >= 200 && response.status < 300,
          data: {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: response.data,
            url: response.config.url
          },
          executedAt: new Date().toISOString(),
          duration
        };
      } else {
        // If we get here, all retries failed
        return {
          nodeId: node.id,
          success: false,
          data: { 
            error: lastError?.message || 'HTTP request failed',
            attempts: maxRetries + 1,
            errorCode: (lastError as AxiosError)?.code
          },
          executedAt: new Date().toISOString(),
          duration
        };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        nodeId: node.id,
        success: false,
        data: { 
          error: (error as Error).message,
          errorCode: (error as AxiosError)?.code
        },
        executedAt: new Date().toISOString(),
        duration
      };
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

  validate(node: Node): ValidationResult {
    const params = node.parameters as unknown as HttpRequestNodeParameters;
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (!params.url) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'URL is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    if (!params.method) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'HTTP method is required',
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    // URL format validation
    if (params.url) {
      try {
        new URL(params.url);
      } catch {
        errors.push({
          code: 'INVALID_URL',
          message: 'URL format is invalid',
          nodeId: node.id,
          severity: 'error' as const
        });
      }
    }

    // Method validation
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (params.method && !validMethods.includes(params.method)) {
      errors.push({
        code: 'INVALID_HTTP_METHOD',
        message: `Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`,
        nodeId: node.id,
        severity: 'error' as const
      });
    }

    // Authentication validation
    if (params.authentication) {
      const auth = params.authentication;
      switch (auth.type) {
        case 'bearer':
          if (!auth.token) {
            errors.push({
              code: 'MISSING_AUTH_TOKEN',
              message: 'Bearer token is required for bearer authentication',
              nodeId: node.id,
              severity: 'error' as const
            });
          }
          break;
        case 'basic':
          if (!auth.username || !auth.password) {
            errors.push({
              code: 'MISSING_AUTH_CREDENTIALS',
              message: 'Username and password are required for basic authentication',
              nodeId: node.id,
              severity: 'error' as const
            });
          }
          break;
        case 'api-key':
          if (!auth.apiKey || !auth.headerName) {
            errors.push({
              code: 'MISSING_API_KEY',
              message: 'API key and header name are required for API key authentication',
              nodeId: node.id,
              severity: 'error' as const
            });
          }
          break;
      }
    }

    // Warnings for common issues
    if (params.timeout && params.timeout < 1000) {
      warnings.push({
        code: 'LOW_TIMEOUT',
        message: 'Timeout is very low, this may cause frequent failures',
        nodeId: node.id,
        severity: 'warning' as const
      });
    }

    if (params.retries && params.retries > 5) {
      warnings.push({
        code: 'HIGH_RETRY_COUNT',
        message: 'High retry count may cause long execution times',
        nodeId: node.id,
        severity: 'warning' as const
      });
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