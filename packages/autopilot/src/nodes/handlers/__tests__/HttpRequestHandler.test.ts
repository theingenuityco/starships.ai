/**
 * HttpRequestHandler Unit Tests
 */

import { HttpRequestHandler } from '@/nodes/handlers/HttpRequestHandler';
import { Node, Execution, HttpRequestNodeParameters } from '@/types';

// Mock HttpRequest class
jest.mock('../../../HttpRequest');

import { HttpRequest } from '@/HttpRequest';

const MockedHttpRequest = HttpRequest as jest.MockedClass<typeof HttpRequest>;

describe('HttpRequestHandler', () => {
  let handler: HttpRequestHandler;
  let mockNode: Node;
  let mockExecution: Execution;

  beforeEach(() => {
    mockNode = {
      ref: 'http-request-node',
      type: 'http_request',
      name: 'Test HTTP Request',
      description: 'HTTP request for testing',
      parameters: {
        url: 'https://api.example.com/data',
        method: 'GET',
      } as HttpRequestNodeParameters,
    };

    handler = new HttpRequestHandler(mockNode);
    mockExecution = global.createMockExecution();

    // Reset mocks
    jest.clearAllMocks();
    MockedHttpRequest.mockClear();

    // Setup default mock for validate method
    MockedHttpRequest.prototype.validate = jest.fn().mockReturnValue({
      valid: true,
      errors: [],
    });
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('http_request');
    });
  });

  describe('execute', () => {
    it('should handle execution errors gracefully', async () => {
      const mockExecuteResult = {
        status: 'failed' as const,
        error: new Error('HTTP request failed: Network Error'),
      };

      MockedHttpRequest.prototype.execute = jest.fn().mockResolvedValue(mockExecuteResult);

      const result = await handler.execute(mockExecution);

      const nodeResult = result.executionResults.get('http-request-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBe(
        'HTTP GET request to https://api.example.com/data failed: HTTP request failed: Network Error'
      );
      expect(nodeResult?.nodeRef).toBe('http-request-node');
    });

    it('should execute successfully with valid request', async () => {
      const mockExecuteResult = {
        status: 'completed' as const,
        data: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: { message: 'success' },
          url: 'https://api.example.com/data',
        },
      };

      MockedHttpRequest.prototype.execute = jest.fn().mockResolvedValue(mockExecuteResult);

      const result = await handler.execute(mockExecution);

      const nodeResult = result.executionResults.get('http-request-node');
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('http-request-node');
      expect(nodeResult?.data).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { message: 'success' },
        url: 'https://api.example.com/data',
        output: 'HTTP GET request to https://api.example.com/data completed successfully',
      });
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const result = handler.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should fail validation when URL is missing', () => {
      const nodeWithoutURL: Node = {
        ...mockNode,
        parameters: {
          method: 'GET',
        } as HttpRequestNodeParameters,
      };
      const handlerWithoutURL = new HttpRequestHandler(nodeWithoutURL);

      const result = handlerWithoutURL.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'URL is required',
        nodeRef: 'http-request-node',
        severity: 'error',
      });
    });

    it('should fail validation when method is missing', () => {
      const nodeWithoutMethod: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
        } as HttpRequestNodeParameters,
      };
      const handlerWithoutMethod = new HttpRequestHandler(nodeWithoutMethod);

      const result = handlerWithoutMethod.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'HTTP method is required',
        nodeRef: 'http-request-node',
        severity: 'error',
      });
    });

    it('should fail validation with invalid URL format', () => {
      const nodeWithInvalidURL: Node = {
        ...mockNode,
        parameters: {
          url: 'not-a-valid-url',
          method: 'GET',
        } as HttpRequestNodeParameters,
      };

      // Mock validation to return the expected error
      MockedHttpRequest.prototype.validate = jest.fn().mockReturnValue({
        valid: false,
        errors: ['URL format is invalid'],
      });

      const handlerWithInvalidURL = new HttpRequestHandler(nodeWithInvalidURL);

      const result = handlerWithInvalidURL.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'VALIDATION_FAILED',
        message: 'URL format is invalid',
        nodeRef: 'http-request-node',
        severity: 'error',
      });
    });

    it('should fail validation with invalid HTTP method', () => {
      const nodeWithInvalidMethod: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'INVALID' as any,
        } as HttpRequestNodeParameters,
      };

      // Mock validation to return the expected error
      MockedHttpRequest.prototype.validate = jest.fn().mockReturnValue({
        valid: false,
        errors: [
          'Invalid HTTP method. Must be one of: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
        ],
      });

      const handlerWithInvalidMethod = new HttpRequestHandler(nodeWithInvalidMethod);

      const result = handlerWithInvalidMethod.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'VALIDATION_FAILED',
        message:
          'Invalid HTTP method. Must be one of: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
        nodeRef: 'http-request-node',
        severity: 'error',
      });
    });

    it('should fail validation for bearer auth without token', () => {
      const nodeWithIncompleteAuth: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          authentication: {
            type: 'bearer',
          },
        } as HttpRequestNodeParameters,
      };

      // Mock validation to return the expected error
      MockedHttpRequest.prototype.validate = jest.fn().mockReturnValue({
        valid: false,
        errors: ['Bearer token is required for bearer authentication'],
      });

      const handlerWithIncompleteAuth = new HttpRequestHandler(nodeWithIncompleteAuth);

      const result = handlerWithIncompleteAuth.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'VALIDATION_FAILED',
        message: 'Bearer token is required for bearer authentication',
        nodeRef: 'http-request-node',
        severity: 'error',
      });
    });

    it('should fail validation for basic auth without credentials', () => {
      const nodeWithIncompleteAuth: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          authentication: {
            type: 'basic',
            username: 'user',
            // missing password
          },
        } as HttpRequestNodeParameters,
      };

      // Mock validation to return the expected error
      MockedHttpRequest.prototype.validate = jest.fn().mockReturnValue({
        valid: false,
        errors: ['Username and password are required for basic authentication'],
      });

      const handlerWithIncompleteAuth = new HttpRequestHandler(nodeWithIncompleteAuth);

      const result = handlerWithIncompleteAuth.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'VALIDATION_FAILED',
        message: 'Username and password are required for basic authentication',
        nodeRef: 'http-request-node',
        severity: 'error',
      });
    });

    it('should fail validation for api-key auth without key or header', () => {
      const nodeWithIncompleteAuth: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          authentication: {
            type: 'api-key',
            apiKey: 'key',
            // missing headerName
          },
        } as HttpRequestNodeParameters,
      };

      // Mock validation to return the expected error
      MockedHttpRequest.prototype.validate = jest.fn().mockReturnValue({
        valid: false,
        errors: ['API key and header name are required for API key authentication'],
      });

      const handlerWithIncompleteAuth = new HttpRequestHandler(nodeWithIncompleteAuth);

      const result = handlerWithIncompleteAuth.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'VALIDATION_FAILED',
        message: 'API key and header name are required for API key authentication',
        nodeRef: 'http-request-node',
        severity: 'error',
      });
    });

    it('should warn about low timeout', () => {
      const nodeWithLowTimeout: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          timeout: 500,
        } as HttpRequestNodeParameters,
      };

      // Mock validation to return the expected error
      MockedHttpRequest.prototype.validate = jest.fn().mockReturnValue({
        valid: false,
        errors: ['Timeout should be at least 1000ms'],
      });

      const handlerWithLowTimeout = new HttpRequestHandler(nodeWithLowTimeout);

      const result = handlerWithLowTimeout.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'VALIDATION_FAILED',
        message: 'Timeout should be at least 1000ms',
        nodeRef: 'http-request-node',
        severity: 'error',
      });
    });

    it('should warn about high retry count', () => {
      const nodeWithHighRetries: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          retries: 10,
        } as HttpRequestNodeParameters,
      };
      const handlerWithHighRetries = new HttpRequestHandler(nodeWithHighRetries);

      const result = handlerWithHighRetries.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        code: 'POTENTIAL_TIMEOUT',
        message: 'High retry count may cause long execution times',
        nodeRef: 'http-request-node',
      });
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('globe');
    });
  });
});
