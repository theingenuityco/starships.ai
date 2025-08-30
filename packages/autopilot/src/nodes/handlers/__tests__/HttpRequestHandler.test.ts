/**
 * HttpRequestHandler Unit Tests
 */

import { HttpRequestHandler } from '../HttpRequestHandler';
import { Node, ExecutionContext, HttpRequestNodeParameters } from '../../../types';

// Mock axios completely
jest.mock('axios', () => ({
  __esModule: true,
  default: jest.fn(),
  isCancel: jest.fn()
}));

import axios from 'axios';

const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe('HttpRequestHandler', () => {
  let handler: HttpRequestHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    mockNode = {
      id: 'http-request-node',
      type: 'http_request',
      name: 'Test HTTP Request',
      description: 'HTTP request for testing',
      parameters: {
        url: 'https://api.example.com/data',
        method: 'GET'
      } as HttpRequestNodeParameters
    };

    handler = new HttpRequestHandler(mockNode);
    mockContext = global.createMockContext();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('http_request');
    });
  });

  describe('execute', () => {
    it('should handle execution errors gracefully', async () => {
      const mockError = new Error('Network Error');
      mockedAxios.mockRejectedValue(mockError);

      const result = await handler.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network Error');
      expect(result.nodeId).toBe('http-request-node');
      expect(result.duration).toBeGreaterThanOrEqual(0);
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
          method: 'GET'
        } as HttpRequestNodeParameters
      };
      const handlerWithoutURL = new HttpRequestHandler(nodeWithoutURL);

      const result = handlerWithoutURL.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'URL is required',
        nodeId: 'http-request-node',
        severity: 'error'
      });
    });

    it('should fail validation when method is missing', () => {
      const nodeWithoutMethod: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data'
        } as HttpRequestNodeParameters
      };
      const handlerWithoutMethod = new HttpRequestHandler(nodeWithoutMethod);

      const result = handlerWithoutMethod.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'HTTP method is required',
        nodeId: 'http-request-node',
        severity: 'error'
      });
    });

    it('should fail validation with invalid URL format', () => {
      const nodeWithInvalidURL: Node = {
        ...mockNode,
        parameters: {
          url: 'not-a-valid-url',
          method: 'GET'
        } as HttpRequestNodeParameters
      };
      const handlerWithInvalidURL = new HttpRequestHandler(nodeWithInvalidURL);

      const result = handlerWithInvalidURL.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_URL',
        message: 'URL format is invalid',
        nodeId: 'http-request-node',
        severity: 'error'
      });
    });

    it('should fail validation with invalid HTTP method', () => {
      const nodeWithInvalidMethod: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'INVALID' as any
        } as HttpRequestNodeParameters
      };
      const handlerWithInvalidMethod = new HttpRequestHandler(nodeWithInvalidMethod);

      const result = handlerWithInvalidMethod.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'INVALID_HTTP_METHOD',
        message: 'Invalid HTTP method. Must be one of: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
        nodeId: 'http-request-node',
        severity: 'error'
      });
    });

    it('should fail validation for bearer auth without token', () => {
      const nodeWithIncompleteAuth: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          authentication: {
            type: 'bearer'
          }
        } as HttpRequestNodeParameters
      };
      const handlerWithIncompleteAuth = new HttpRequestHandler(nodeWithIncompleteAuth);

      const result = handlerWithIncompleteAuth.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_AUTH_TOKEN',
        message: 'Bearer token is required for bearer authentication',
        nodeId: 'http-request-node',
        severity: 'error'
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
            username: 'user'
            // missing password
          }
        } as HttpRequestNodeParameters
      };
      const handlerWithIncompleteAuth = new HttpRequestHandler(nodeWithIncompleteAuth);

      const result = handlerWithIncompleteAuth.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_AUTH_CREDENTIALS',
        message: 'Username and password are required for basic authentication',
        nodeId: 'http-request-node',
        severity: 'error'
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
            apiKey: 'key'
            // missing headerName
          }
        } as HttpRequestNodeParameters
      };
      const handlerWithIncompleteAuth = new HttpRequestHandler(nodeWithIncompleteAuth);

      const result = handlerWithIncompleteAuth.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        code: 'MISSING_API_KEY',
        message: 'API key and header name are required for API key authentication',
        nodeId: 'http-request-node',
        severity: 'error'
      });
    });

    it('should warn about low timeout', () => {
      const nodeWithLowTimeout: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          timeout: 500
        } as HttpRequestNodeParameters
      };
      const handlerWithLowTimeout = new HttpRequestHandler(nodeWithLowTimeout);

      const result = handlerWithLowTimeout.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        code: 'LOW_TIMEOUT',
        message: 'Timeout is very low, this may cause frequent failures',
        nodeId: 'http-request-node',
        severity: 'warning'
      });
    });

    it('should warn about high retry count', () => {
      const nodeWithHighRetries: Node = {
        ...mockNode,
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          retries: 10
        } as HttpRequestNodeParameters
      };
      const handlerWithHighRetries = new HttpRequestHandler(nodeWithHighRetries);

      const result = handlerWithHighRetries.validate();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual({
        code: 'HIGH_RETRY_COUNT',
        message: 'High retry count may cause long execution times',
        nodeId: 'http-request-node',
        severity: 'warning'
      });
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('globe');
    });
  });
});