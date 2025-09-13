/**
 * HttpRequest Node Handler Tests
 *
 * Tests for HTTP API calls with full fetch compatibility
 */

import { HttpRequest } from '../HttpRequest';
import type { HttpRequestParams } from '@/types/node-parameters';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('HttpRequest Node Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic HTTP Functionality', () => {
    it('should execute GET request successfully', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/data',
        method: 'GET',
      };

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/data',
        headers: mockHeaders,
        json: async () => ({ success: true, data: 'test data' }),
        text: async () => '{"success":true,"data":"test data"}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { success: true, data: 'test data' },
        url: 'https://api.example.com/data',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
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

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        url: 'https://api.example.com/submit',
        headers: mockHeaders,
        json: async () => ({ id: 123, status: 'created' }),
        text: async () => '{"id":123,"status":"created"}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 201,
        statusText: 'Created',
        headers: { 'content-type': 'application/json' },
        body: { id: 123, status: 'created' },
        url: 'https://api.example.com/submit',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/submit',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'John Doe',
            email: 'john@example.com',
          }),
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

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/webhook',
        headers: mockHeaders,
        json: async () => ({ received: true }),
        text: async () => '{"received":true}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { received: true },
        url: 'https://api.example.com/webhook',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/webhook',
        expect.objectContaining({
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

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/secure',
        headers: mockHeaders,
        json: async () => ({ authenticated: true }),
        text: async () => '{"authenticated":true}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { authenticated: true },
        url: 'https://api.example.com/secure',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/secure',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
            'X-API-Key': 'api-key-456',
            'User-Agent': 'Autopilot/1.0',
            'Content-Type': 'application/json',
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

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/resource/123',
        headers: mockHeaders,
        json: async () => ({ updated: true }),
        text: async () => '{"updated":true}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { updated: true },
        url: 'https://api.example.com/resource/123',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/resource/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ status: 'updated' }),
        })
      );
    });

    it('should handle DELETE request', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/resource/123',
        method: 'DELETE',
      };

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        url: 'https://api.example.com/resource/123',
        headers: mockHeaders,
        json: async () => null,
        text: async () => '',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 204,
        statusText: 'No Content',
        headers: { 'content-type': 'application/json' },
        body: null,
        url: 'https://api.example.com/resource/123',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/resource/123',
        expect.objectContaining({
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

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/resource/123',
        headers: mockHeaders,
        json: async () => ({ patched: true }),
        text: async () => '{"patched":true}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { patched: true },
        url: 'https://api.example.com/resource/123',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/resource/123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Name' }),
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

      const mockHeaders = new Map([['content-type', 'text/plain']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('text/plain', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/text',
        headers: mockHeaders,
        json: async () => {
          throw new Error('Not JSON');
        },
        text: async () => 'Plain text response',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
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

      const mockHeaders = new Map([['content-length', '0']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('0', 'content-length', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        url: 'https://api.example.com/empty',
        headers: mockHeaders,
        json: async () => {
          throw new Error('No content');
        },
        text: async () => '',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
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

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const httpRequest = new HttpRequest(params);

      await expect(httpRequest.execute()).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle network errors', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/network-error',
        method: 'GET',
      };

      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const httpRequest = new HttpRequest(params);

      await expect(httpRequest.execute()).rejects.toThrow('HTTP request failed: Network failure');
    });

    it('should handle timeout errors', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/slow',
        method: 'GET',
        timeout: 1000,
      };

      // Mock fetch to never resolve (simulating slow response)
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      const httpRequest = new HttpRequest(params);

      await expect(httpRequest.execute()).rejects.toThrow('HTTP request timeout after 1000ms');
    }, 5000);

    it('should handle invalid URLs', async () => {
      const params: HttpRequestParams = {
        url: 'invalid-url',
        method: 'GET',
      };

      mockFetch.mockRejectedValueOnce(new TypeError('Invalid URL'));

      const httpRequest = new HttpRequest(params);

      await expect(httpRequest.execute()).rejects.toThrow('HTTP request failed: Invalid URL');
    });
  });

  describe('Timeout Functionality', () => {
    it('should respect custom timeout', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/timeout-test',
        method: 'GET',
        timeout: 2000,
      };

      // Mock a slow response
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  json: async () => ({ delayed: true }),
                }),
              3000
            )
          )
      );

      const httpRequest = new HttpRequest(params);

      await expect(httpRequest.execute()).rejects.toThrow('HTTP request timeout after 2000ms');
    });

    it('should use default timeout when not specified', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/default-timeout',
        method: 'GET',
      };

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/default-timeout',
        headers: mockHeaders,
        json: async () => ({ success: true }),
        text: async () => '{"success":true}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { success: true },
        url: 'https://api.example.com/default-timeout',
      });
    });
  });

  describe('Request Body Handling', () => {
    it('should handle null body', async () => {
      const params: HttpRequestParams = {
        url: 'https://api.example.com/null-body',
        method: 'POST',
        body: null,
      };

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/null-body',
        headers: mockHeaders,
        json: async () => ({ received: true }),
        text: async () => '{"received":true}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { received: true },
        url: 'https://api.example.com/null-body',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/null-body',
        expect.objectContaining({
          method: 'POST',
          body: null,
        })
      );
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

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/complex',
        headers: mockHeaders,
        json: async () => ({ processed: true }),
        text: async () => '{"processed":true}',
      });

      const httpRequest = new HttpRequest(params);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { processed: true },
        url: 'https://api.example.com/complex',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/complex',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(complexBody),
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
      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        url: 'https://api.example.com/items',
        headers: mockHeaders,
        json: async () => ({ id: 1, name: 'Created Item' }),
        text: async () => '{"id":1,"name":"Created Item"}',
      });

      const createParams: HttpRequestParams = {
        url: 'https://api.example.com/items',
        method: 'POST',
        body: { name: 'New Item' },
      };

      const httpRequest = new HttpRequest(createParams);
      const created = await httpRequest.execute();

      expect(created).toEqual({
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

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://webhook.example.com/notify',
        headers: mockHeaders,
        json: async () => ({ received: true, queued: true }),
        text: async () => '{"received":true,"queued":true}',
      });

      const httpRequest = new HttpRequest(webhookParams);
      const result = await httpRequest.execute();

      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { received: true, queued: true },
        url: 'https://webhook.example.com/notify',
      });
    });
  });
});
