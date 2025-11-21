/**
 * HttpRequest Node Handler Tests
 *
 * Tests for HTTP API calls with full fetch compatibility
 */

import { HttpRequest } from '../HttpRequest';
import type { HttpRequestParams } from '@/types/node-parameters';
import type { HostRuntime } from '@/types/node-handler';

let hostRuntime: HostRuntime;
let httpMock: jest.Mock;

describe('HttpRequest Node Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default HostRuntime HTTP mock; individual tests can override as needed
    httpMock = jest.fn(async ({ url, method, headers = {}, body, timeoutMs }) => ({
      status: 200,
      statusText: 'OK',
      headers,
      body: { echoedUrl: url, echoedMethod: method, body, timeoutMs },
      url,
    }));

    hostRuntime = {
      http: httpMock as HostRuntime['http'],
    };
  });

  describe('Basic HTTP Functionality', () => {
    it('should execute GET request successfully', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/data',
        method: 'GET',
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/data',
        headers: { 'content-type': 'application/json' },
        body: { success: true, data: 'test data' },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { success: true, data: 'test data' },
        url: 'https://api.example.com/data',
      });
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/data',
          method: 'GET',
        })
      );
    });

    it('should execute POST request with JSON body', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/submit',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      httpMock.mockResolvedValueOnce({
        status: 201,
        statusText: 'Created',
        url: 'https://api.example.com/submit',
        headers: { 'content-type': 'application/json' },
        body: { id: 123, status: 'created' },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 201,
        statusText: 'Created',
        headers: { 'content-type': 'application/json' },
        body: { id: 123, status: 'created' },
        url: 'https://api.example.com/submit',
      });
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/submit',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            name: 'John Doe',
            email: 'john@example.com',
          },
        })
      );
    });

    it('should execute POST request with string body', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: 'plain text data',
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/webhook',
        headers: { 'content-type': 'application/json' },
        body: { received: true },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { received: true },
        url: 'https://api.example.com/webhook',
      });
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/webhook',
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: 'plain text data',
        })
      );
    });

    it('should handle custom headers and authentication', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/secure',
        method: 'GET',
        headers: {
          Authorization: 'Bearer token-123',
          'X-API-Key': 'api-key-456',
          'User-Agent': 'Autopilot/1.0',
        },
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/secure',
        headers: { 'content-type': 'application/json' },
        body: { authenticated: true },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { authenticated: true },
        url: 'https://api.example.com/secure',
      });
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/secure',
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
            'X-API-Key': 'api-key-456',
            'User-Agent': 'Autopilot/1.0',
          }),
        })
      );
    });
  });

  describe('HTTP Methods', () => {
    it('should handle PUT request', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/resource/123',
        method: 'PUT',
        body: { status: 'updated' },
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/resource/123',
        headers: { 'content-type': 'application/json' },
        body: { updated: true },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { updated: true },
        url: 'https://api.example.com/resource/123',
      });
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/resource/123',
          method: 'PUT',
          body: { status: 'updated' },
        })
      );
    });

    it('should handle DELETE request', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/resource/123',
        method: 'DELETE',
      };

      httpMock.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        url: 'https://api.example.com/resource/123',
        headers: { 'content-type': 'application/json' },
        body: null,
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 204,
        statusText: 'No Content',
        headers: { 'content-type': 'application/json' },
        body: null,
        url: 'https://api.example.com/resource/123',
      });
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/resource/123',
          method: 'DELETE',
        })
      );
    });

    it('should handle PATCH request', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/resource/123',
        method: 'PATCH',
        body: { name: 'Updated Name' },
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/resource/123',
        headers: { 'content-type': 'application/json' },
        body: { patched: true },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { patched: true },
        url: 'https://api.example.com/resource/123',
      });
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/resource/123',
          method: 'PATCH',
          body: { name: 'Updated Name' },
        })
      );
    });
  });

  describe('Response Handling', () => {
    it('should handle non-JSON responses', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/text',
        method: 'GET',
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/text',
        headers: { 'content-type': 'text/plain' },
        body: 'Plain text response',
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: 'Plain text response',
        url: 'https://api.example.com/text',
      });
    });

    it('should handle empty responses', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/empty',
        method: 'POST',
      };

      httpMock.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        url: 'https://api.example.com/empty',
        headers: { 'content-length': '0' },
        body: '',
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 204,
        statusText: 'No Content',
        headers: { 'content-length': '0' },
        body: '',
        url: 'https://api.example.com/empty',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP error responses', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/error',
        method: 'GET',
      };

      httpMock.mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
        url: 'https://api.example.com/error',
        headers: { 'content-type': 'text/plain' },
        body: 'Not Found',
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      await expect(httpRequest.execute()).rejects.toThrow(/HTTP request failed: .*404 .*Not Found/);
    });

    it('should handle network errors', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/network-error',
        method: 'GET',
      };

      httpMock.mockRejectedValueOnce(new Error('Network failure'));

      const httpRequest = new HttpRequest(params, { hostRuntime });
      await expect(httpRequest.execute()).rejects.toThrow('Network failure');
    });

    it('should handle timeout errors', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/slow',
        method: 'GET',
        timeout: 100, // Very short timeout for quick test
      };

      httpMock.mockRejectedValueOnce(new Error('timeout after 100ms'));

      const httpRequest = new HttpRequest(params, { hostRuntime });
      await expect(httpRequest.execute()).rejects.toThrow('timeout after 100ms');
    }, 2000);

    it('should handle invalid URLs', async () => {
      const params: HttpRequestParams = {
        url: 'invalid-url',
        method: 'GET',
      };

      httpMock.mockRejectedValueOnce(new TypeError('Invalid URL'));

      const httpRequest = new HttpRequest(params, { hostRuntime });
      await expect(httpRequest.execute()).rejects.toThrow('Invalid URL');
    });
  });

  describe('Timeout Functionality', () => {
    it('should respect custom timeout', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/timeout-test',
        method: 'GET',
        timeout: 2000,
      };

      httpMock.mockRejectedValueOnce(new Error('timeout after 2000ms'));

      const httpRequest = new HttpRequest(params, { hostRuntime });
      await expect(httpRequest.execute()).rejects.toThrow('timeout after 2000ms');
    });

    it('should use default timeout when not specified', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/default-timeout',
        method: 'GET',
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/default-timeout',
        headers: { 'content-type': 'application/json' },
        body: { success: true },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { success: true },
        url: 'https://api.example.com/default-timeout',
      });
      // Should use default timeout when not specified
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: 30000,
        })
      );
    });
  });

  describe('Request Body Handling', () => {
    it('should handle null body', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/null-body',
        method: 'POST',
        body: null,
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/null-body',
        headers: { 'content-type': 'application/json' },
        body: { received: true },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { received: true },
        url: 'https://api.example.com/null-body',
      });
    });

    it('should handle complex nested objects in body', async () => {
      const complexBody = {
        user: {
          name: 'John Doe',
          preferences: {
            theme: 'dark',
            notifications: true,
            features: ['feature1', 'feature2'],
          },
        },
        metadata: {
          source: 'api',
          timestamp: Date.now(),
        },
      };

      const params: HttpRequestParams = {
        url: 'https://api.example.com/complex',
        method: 'POST',
        body: complexBody,
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/complex',
        headers: { 'content-type': 'application/json' },
        body: { processed: true },
      });

      const httpRequest = new HttpRequest(params, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { processed: true },
        url: 'https://api.example.com/complex',
      });
      expect(httpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/complex',
          method: 'POST',
          body: complexBody,
        })
      );
    });
  });

  describe('Validation', () => {
    it('should validate required URL parameter', () => {
      const params = {
        method: 'GET',
        // Missing URL
      } as HttpRequestParams;

      const httpRequest = new HttpRequest(params);
      const validation = httpRequest.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'URL is required',
        })
      );
    });

    it('should pass validation with valid parameters', () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/valid',
        method: 'GET',
        headers: {
          Authorization: 'Bearer token',
        },
        timeout: 30000,
      };

      const httpRequest = new HttpRequest(params);
      const validation = httpRequest.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle REST API CRUD operations', async () => {
      // CREATE
      const createParams: HttpRequestParams = {
        url: 'https://api.example.com/items',
        method: 'POST',
        body: { name: 'New Item' },
      };

      httpMock.mockResolvedValueOnce({
        status: 201,
        statusText: 'Created',
        url: 'https://api.example.com/items',
        headers: { 'content-type': 'application/json' },
        body: { id: 1, name: 'Created Item' },
      });

      const httpRequest = new HttpRequest(createParams, { hostRuntime });
      const created = await httpRequest.execute();

      expect(created).toHaveLength(1);
      expect(created[0].json).toEqual({
        status: 201,
        statusText: 'Created',
        headers: { 'content-type': 'application/json' },
        body: { id: 1, name: 'Created Item' },
        url: 'https://api.example.com/items',
      });
    });

    it('should handle webhook-style requests', async () => {
      const webhookParams: HttpRequestParams = {
        url: 'https://webhook.example.com/notify',
        method: 'POST',
        headers: {
          'X-Webhook-Signature': 'sha256=abc123',
          'Content-Type': 'application/json',
        },
        body: {
          event: 'user.created',
          data: { userId: 123, email: 'user@example.com' },
          timestamp: Date.now(),
        },
      };

      httpMock.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        url: 'https://webhook.example.com/notify',
        headers: { 'content-type': 'application/json' },
        body: { received: true, queued: true },
      });

      const httpRequest = new HttpRequest(webhookParams, { hostRuntime });
      const result = await httpRequest.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { received: true, queued: true },
        url: 'https://webhook.example.com/notify',
      });
    });
  });
});
