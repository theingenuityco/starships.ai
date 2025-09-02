/**
 * HttpRequest Unit Tests
 */

import axios, { AxiosResponse, AxiosError } from 'axios';
import { HttpRequest } from '../HttpRequest';
import { HttpRequestNodeParameters } from '../types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Type assertion for mockedAxios as a function
const axiosInstance = mockedAxios as unknown as jest.MockedFunction<typeof axios>;

describe('HttpRequest', () => {
  let httpRequest: HttpRequest;
  let basicParams: HttpRequestNodeParameters;

  beforeEach(() => {
    basicParams = {
      url: 'https://api.example.com/test',
      method: 'GET'
    };
    httpRequest = new HttpRequest(basicParams);
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup axios.isCancel mock
    mockedAxios.isCancel.mockReturnValue(false);
  });

  describe('constructor', () => {
    it('should initialize with basic parameters', () => {
      const request = new HttpRequest(basicParams);
      expect(request.getUrl()).toBe('https://api.example.com/test');
      expect(request.getMethod()).toBe('GET');
    });

    it('should deep copy parameters to prevent mutations', () => {
      const params: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        authentication: { type: 'bearer', token: 'test-token' }
      };

      const request = new HttpRequest(params);
      
      // Mutate original params
      params.url = 'https://modified.com';
      params.headers!['Authorization'] = 'Bearer modified';
      params.authentication!.token = 'modified-token';
      
      // HttpRequest should have original values
      expect(request.getUrl()).toBe('https://api.example.com/test');
      expect(request.getHeaders()).toEqual({ 'Content-Type': 'application/json' });
    });

    it('should handle undefined optional parameters', () => {
      const minimalParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET'
      };

      const request = new HttpRequest(minimalParams);
      
      expect(request.getHeaders()).toBeUndefined();
      expect(request.getBody()).toBeUndefined();
      expect(request.getTimeout()).toBeUndefined();
    });
  });

  describe('getter methods', () => {
    beforeEach(() => {
      const fullParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test' },
        body: { name: 'John Doe' },
        timeout: 5000,
        retries: 3,
        followRedirects: false,
        authentication: { type: 'bearer', token: 'test-token' }
      };
      httpRequest = new HttpRequest(fullParams);
    });

    it('should get URL', () => {
      expect(httpRequest.getUrl()).toBe('https://api.example.com/users');
    });

    it('should get method', () => {
      expect(httpRequest.getMethod()).toBe('POST');
    });

    it('should get headers as a copy', () => {
      const headers = httpRequest.getHeaders();
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'X-API-Key': 'test'
      });
      
      // Modify returned headers should not affect original
      headers!['Modified'] = 'value';
      expect(httpRequest.getHeaders()).toEqual({
        'Content-Type': 'application/json',
        'X-API-Key': 'test'
      });
    });

    it('should get body', () => {
      expect(httpRequest.getBody()).toEqual({ name: 'John Doe' });
    });

    it('should get timeout', () => {
      expect(httpRequest.getTimeout()).toBe(5000);
    });

    it('should get parameters as deep copy', () => {
      const params = httpRequest.getParameters();
      expect(params.url).toBe('https://api.example.com/users');
      expect(params.method).toBe('POST');
      expect(params.headers).toEqual({
        'Content-Type': 'application/json',
        'X-API-Key': 'test'
      });
      
      // Modify returned params should not affect original
      params.url = 'https://modified.com';
      params.headers!['Modified'] = 'value';
      
      expect(httpRequest.getUrl()).toBe('https://api.example.com/users');
      expect(httpRequest.getHeaders()).toEqual({
        'Content-Type': 'application/json',
        'X-API-Key': 'test'
      });
    });

    it('should return undefined for missing headers', () => {
      const minimalRequest = new HttpRequest(basicParams);
      expect(minimalRequest.getHeaders()).toBeUndefined();
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should execute successful GET request', async () => {
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        data: { success: true },
        config: { 
          url: 'https://api.example.com/test'
        }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      const result = await httpRequest.execute();

      expect(result.status).toBe('completed');
      expect(result.data).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { success: true },
        url: 'https://api.example.com/test'
      });
      expect(result.error).toBeUndefined();
    });

    it('should execute successful POST request with body', async () => {
      const postParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'John Doe' }
      };

      const postRequest = new HttpRequest(postParams);
      const mockResponse: AxiosResponse = {
        status: 201,
        statusText: 'Created',
        headers: {},
        data: { id: 1, name: 'John Doe' },
        config: { url: 'https://api.example.com/users' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      const result = await postRequest.execute();

      expect(result.status).toBe('completed');
      expect(result.data?.status).toBe(201);
      expect(result.data?.body).toEqual({ id: 1, name: 'John Doe' });

      // Verify axios was called with correct config
      expect(axiosInstance).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: expect.any(Function),
        data: { name: 'John Doe' }
      });
    });

    it('should handle authentication - bearer token', async () => {
      const authParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/secured',
        method: 'GET',
        authentication: { type: 'bearer', token: 'test-token-123' }
      };

      const authRequest = new HttpRequest(authParams);
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { authenticated: true },
        config: { url: 'https://api.example.com/secured' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      await authRequest.execute();

      expect(axiosInstance).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.example.com/secured',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-123'
        },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: expect.any(Function)
      });
    });

    it('should handle authentication - basic auth', async () => {
      const authParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/secured',
        method: 'GET',
        authentication: { type: 'basic', username: 'user', password: 'pass' }
      };

      const authRequest = new HttpRequest(authParams);
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { authenticated: true },
        config: { url: 'https://api.example.com/secured' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      await authRequest.execute();

      expect(axiosInstance).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.example.com/secured',
        headers: {
          'Content-Type': 'application/json'
        },
        auth: {
          username: 'user',
          password: 'pass'
        },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: expect.any(Function)
      });
    });

    it('should handle authentication - API key', async () => {
      const authParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/secured',
        method: 'GET',
        authentication: { type: 'api-key', apiKey: 'key123', headerName: 'X-API-Key' }
      };

      const authRequest = new HttpRequest(authParams);
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { authenticated: true },
        config: { url: 'https://api.example.com/secured' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      await authRequest.execute();

      expect(axiosInstance).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.example.com/secured',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'key123'
        },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: expect.any(Function)
      });
    });

    it('should handle custom timeout', async () => {
      const timeoutParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/slow',
        method: 'GET',
        timeout: 10000
      };

      const timeoutRequest = new HttpRequest(timeoutParams);
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { slow: true },
        config: { url: 'https://api.example.com/slow' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      await timeoutRequest.execute();

      expect(axiosInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000
        })
      );
    });

    it('should handle redirects setting', async () => {
      const noRedirectParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/redirect',
        method: 'GET',
        followRedirects: false
      };

      const noRedirectRequest = new HttpRequest(noRedirectParams);
      const mockResponse: AxiosResponse = {
        status: 302,
        statusText: 'Found',
        headers: {},
        data: {},
        config: { url: 'https://api.example.com/redirect' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      await noRedirectRequest.execute();

      expect(axiosInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRedirects: 0
        })
      );
    });

    it('should retry on failure with exponential backoff', async () => {
      const retryParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/unstable',
        method: 'GET',
        retries: 2
      };

      const retryRequest = new HttpRequest(retryParams);
      
      // Mock setTimeout to speed up tests
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as NodeJS.Timeout;
      });

      const networkError = new Error('Network Error') as AxiosError;
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { success: true },
        config: { url: 'https://api.example.com/unstable' }
      } as AxiosResponse;

      // Fail first two attempts, succeed on third
      axiosInstance
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockResponse);

      const result = await retryRequest.execute();

      expect(result.status).toBe('completed');
      expect(axiosInstance).toHaveBeenCalledTimes(3);
      
      jest.restoreAllMocks();
    });

    it('should fail after max retries exceeded', async () => {
      const retryParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/failing',
        method: 'GET',
        retries: 1
      };

      const retryRequest = new HttpRequest(retryParams);
      
      // Mock setTimeout
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as NodeJS.Timeout;
      });

      const networkError = new Error('Persistent Network Error') as AxiosError;
      networkError.message = 'Persistent Network Error';

      // Fail all attempts
      axiosInstance.mockRejectedValue(networkError);

      const result = await retryRequest.execute();

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('HTTP request execution failed: Persistent Network Error');
      expect(axiosInstance).toHaveBeenCalledTimes(2); // Initial + 1 retry
      
      jest.restoreAllMocks();
    });

    it('should not retry on cancel error', async () => {
      const retryParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/canceled',
        method: 'GET',
        retries: 3
      };

      const retryRequest = new HttpRequest(retryParams);
      const cancelError = new Error('Request canceled') as AxiosError;
      
      mockedAxios.isCancel.mockReturnValue(true);
      axiosInstance.mockRejectedValueOnce(cancelError);

      const result = await retryRequest.execute();

      expect(result.status).toBe('failed');
      expect(axiosInstance).toHaveBeenCalledTimes(1); // No retries on cancel
    });

    it('should not retry on timeout error', async () => {
      const retryParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/timeout',
        method: 'GET',
        retries: 3
      };

      const retryRequest = new HttpRequest(retryParams);
      const timeoutError = new Error('Timeout') as AxiosError;
      timeoutError.code = 'ECONNABORTED';
      
      axiosInstance.mockRejectedValueOnce(timeoutError);

      const result = await retryRequest.execute();

      expect(result.status).toBe('failed');
      expect(axiosInstance).toHaveBeenCalledTimes(1); // No retries on timeout
    });

    it('should handle execution errors gracefully', async () => {
      // Mock axios to throw during configuration
      const configError = new Error('Configuration error');
      axiosInstance.mockImplementation(() => {
        throw configError;
      });

      const result = await httpRequest.execute();

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('HTTP request execution failed: Configuration error');
    });

    it('should handle non-Error exceptions', async () => {
      // Mock axios to throw non-Error object
      axiosInstance.mockImplementation(() => {
        throw 'String error';
      });

      const result = await httpRequest.execute();

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('HTTP request execution failed: Unknown error');
    });

    it('should not add body to GET requests', async () => {
      const getWithBodyParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET',
        body: { shouldIgnore: true }
      };

      const getRequest = new HttpRequest(getWithBodyParams);
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config: { url: 'https://api.example.com/test' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      await getRequest.execute();

      expect(axiosInstance).toHaveBeenCalledWith(
        expect.not.objectContaining({
          data: expect.anything()
        })
      );
    });

    it('should not add body to HEAD requests', async () => {
      const headParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'HEAD',
        body: { shouldIgnore: true }
      };

      const headRequest = new HttpRequest(headParams);
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config: { url: 'https://api.example.com/test' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      await headRequest.execute();

      expect(axiosInstance).toHaveBeenCalledWith(
        expect.not.objectContaining({
          data: expect.anything()
        })
      );
    });

    it('should merge custom headers with default Content-Type', async () => {
      const customHeaderParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'POST',
        headers: {
          'X-Custom': 'value',
          'Authorization': 'Bearer override'
        },
        body: { test: true }
      };

      const customRequest = new HttpRequest(customHeaderParams);
      const mockResponse: AxiosResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
        config: { url: 'https://api.example.com/test' }
      } as AxiosResponse;

      axiosInstance.mockResolvedValueOnce(mockResponse);

      await customRequest.execute();

      expect(axiosInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'X-Custom': 'value',
            'Authorization': 'Bearer override'
          }
        })
      );
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const result = httpRequest.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when URL is missing', () => {
      const invalidParams: HttpRequestNodeParameters = {
        url: '',
        method: 'GET'
      };
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('URL is required');
    });

    it('should fail validation when method is missing', () => {
      const invalidParams = {
        url: 'https://api.example.com/test'
      } as HttpRequestNodeParameters;
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('HTTP method is required');
    });

    it('should fail validation with invalid URL format', () => {
      const invalidParams: HttpRequestNodeParameters = {
        url: 'not-a-valid-url',
        method: 'GET'
      };
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('URL format is invalid');
    });

    it('should fail validation with invalid HTTP method', () => {
      const invalidParams = {
        url: 'https://api.example.com/test',
        method: 'INVALID' as any
      } as HttpRequestNodeParameters;
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid HTTP method. Must be one of: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS');
    });

    it('should fail validation with invalid bearer authentication', () => {
      const invalidParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET',
        authentication: { type: 'bearer' } // Missing token
      };
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Bearer token is required for bearer authentication');
    });

    it('should fail validation with invalid basic authentication', () => {
      const invalidParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET',
        authentication: { type: 'basic', username: 'user' } // Missing password
      };
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Username and password are required for basic authentication');
    });

    it('should fail validation with invalid API key authentication', () => {
      const invalidParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET',
        authentication: { type: 'api-key', apiKey: 'key123' } // Missing headerName
      };
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API key and header name are required for API key authentication');
    });

    it('should fail validation with timeout too low', () => {
      const invalidParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET',
        timeout: 500 // Less than 1000ms
      };
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Timeout should be at least 1000ms');
    });

    it('should fail validation with negative retries', () => {
      const invalidParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET',
        retries: -1
      };
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Retries must be non-negative');
    });

    it('should pass validation with all valid parameters', () => {
      const validParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { test: true },
        timeout: 5000,
        retries: 3,
        followRedirects: true,
        authentication: { type: 'bearer', token: 'valid-token' }
      };
      const validRequest = new HttpRequest(validParams);
      
      const result = validRequest.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accumulate multiple validation errors', () => {
      const invalidParams = {
        url: 'invalid-url',
        method: 'INVALID' as any,
        timeout: 500,
        retries: -1,
        authentication: { type: 'bearer' }
      } as HttpRequestNodeParameters;
      const invalidRequest = new HttpRequest(invalidParams);
      
      const result = invalidRequest.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(5);
    });
  });

  describe('clone', () => {
    beforeEach(() => {
      const fullParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'John Doe' },
        timeout: 5000,
        authentication: { type: 'bearer', token: 'test-token' }
      };
      httpRequest = new HttpRequest(fullParams);
    });

    it('should create a new HttpRequest instance', () => {
      const cloned = httpRequest.clone();
      expect(cloned).toBeInstanceOf(HttpRequest);
      expect(cloned).not.toBe(httpRequest);
    });

    it('should copy all parameters', () => {
      const cloned = httpRequest.clone();
      
      expect(cloned.getUrl()).toBe(httpRequest.getUrl());
      expect(cloned.getMethod()).toBe(httpRequest.getMethod());
      expect(cloned.getHeaders()).toEqual(httpRequest.getHeaders());
      expect(cloned.getBody()).toEqual(httpRequest.getBody());
      expect(cloned.getTimeout()).toBe(httpRequest.getTimeout());
    });

    it('should create deep copies to prevent mutation', () => {
      const cloned = httpRequest.clone();
      const clonedParams = cloned.getParameters();
      
      // Modify cloned parameters
      clonedParams.url = 'https://modified.com';
      clonedParams.headers!['Modified'] = 'value';
      
      // Original should remain unchanged
      expect(httpRequest.getUrl()).toBe('https://api.example.com/users');
      expect(httpRequest.getHeaders()).not.toHaveProperty('Modified');
    });

    it('should maintain independence between original and clone', () => {
      const cloned = httpRequest.clone();
      
      // Clones should be independent
      expect(cloned.getParameters()).toEqual(httpRequest.getParameters());
      expect(cloned.getParameters()).not.toBe(httpRequest.getParameters());
    });

    it('should handle cloning with minimal parameters', () => {
      const minimalRequest = new HttpRequest(basicParams);
      const cloned = minimalRequest.clone();
      
      expect(cloned.getUrl()).toBe('https://api.example.com/test');
      expect(cloned.getMethod()).toBe('GET');
      expect(cloned.getHeaders()).toBeUndefined();
    });
  });

  describe('updateParameters', () => {
    beforeEach(() => {
      const baseParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/users',
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Original': 'value' }
      };
      httpRequest = new HttpRequest(baseParams);
    });

    it('should create a new HttpRequest with updated parameters', () => {
      const updates: Partial<HttpRequestNodeParameters> = {
        url: 'https://api.example.com/posts',
        method: 'POST'
      };
      
      const updated = httpRequest.updateParameters(updates);
      
      expect(updated).toBeInstanceOf(HttpRequest);
      expect(updated).not.toBe(httpRequest);
      expect(updated.getUrl()).toBe('https://api.example.com/posts');
      expect(updated.getMethod()).toBe('POST');
    });

    it('should merge headers correctly', () => {
      const updates: Partial<HttpRequestNodeParameters> = {
        headers: { 'X-New': 'header', 'Content-Type': 'application/xml' }
      };
      
      const updated = httpRequest.updateParameters(updates);
      
      expect(updated.getHeaders()).toEqual({
        'Content-Type': 'application/xml', // Overridden
        'X-Original': 'value', // Preserved
        'X-New': 'header' // Added
      });
    });

    it('should replace authentication when provided', () => {
      const originalWithAuth = httpRequest.updateParameters({
        authentication: { type: 'bearer', token: 'original-token' }
      });
      
      const updatedAuth = originalWithAuth.updateParameters({
        authentication: { type: 'api-key', apiKey: 'new-key', headerName: 'X-API-Key' }
      });
      
      const params = updatedAuth.getParameters();
      expect(params.authentication).toEqual({
        type: 'api-key',
        apiKey: 'new-key',
        headerName: 'X-API-Key'
      });
    });

    it('should preserve existing authentication when not updating', () => {
      const withAuth = httpRequest.updateParameters({
        authentication: { type: 'bearer', token: 'test-token' }
      });
      
      const updated = withAuth.updateParameters({
        timeout: 10000
      });
      
      const params = updated.getParameters();
      expect(params.authentication).toEqual({
        type: 'bearer',
        token: 'test-token'
      });
    });

    it('should not mutate original HttpRequest', () => {
      const originalUrl = httpRequest.getUrl();
      const originalHeaders = httpRequest.getHeaders();
      
      httpRequest.updateParameters({
        url: 'https://modified.com',
        headers: { 'X-Modified': 'value' }
      });
      
      expect(httpRequest.getUrl()).toBe(originalUrl);
      expect(httpRequest.getHeaders()).toEqual(originalHeaders);
    });

    it('should handle empty updates', () => {
      const updated = httpRequest.updateParameters({});
      
      expect(updated.getUrl()).toBe(httpRequest.getUrl());
      expect(updated.getMethod()).toBe(httpRequest.getMethod());
      expect(updated.getHeaders()).toEqual(httpRequest.getHeaders());
    });

    it('should handle updating to undefined headers', () => {
      const updated = httpRequest.updateParameters({
        headers: undefined
      });
      
      // Should still merge with existing headers
      expect(updated.getHeaders()).toEqual(httpRequest.getHeaders());
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in URL', () => {
      const specialParams: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test?query=hello%20world&special=@#$%',
        method: 'GET'
      };
      
      const request = new HttpRequest(specialParams);
      expect(request.getUrl()).toBe('https://api.example.com/test?query=hello%20world&special=@#$%');
      
      const validation = request.validate();
      expect(validation.valid).toBe(true);
    });

    it('should handle different HTTP methods correctly', () => {
      const methods: Array<HttpRequestNodeParameters['method']> = [
        'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
      ];
      
      methods.forEach(method => {
        const params: HttpRequestNodeParameters = {
          url: 'https://api.example.com/test',
          method
        };
        
        const request = new HttpRequest(params);
        expect(request.getMethod()).toBe(method);
        expect(request.validate().valid).toBe(true);
      });
    });

    it('should handle complex body objects', () => {
      const complexBody = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          metadata: {
            tags: ['admin', 'user'],
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        timestamp: new Date().toISOString(),
        numbers: [1, 2, 3.14],
        nullValue: null,
        booleanValue: true
      };
      
      const params: HttpRequestNodeParameters = {
        url: 'https://api.example.com/complex',
        method: 'POST',
        body: complexBody
      };
      
      const request = new HttpRequest(params);
      expect(request.getBody()).toEqual(complexBody);
    });

    it('should handle string body content', () => {
      const stringBody = '<?xml version="1.0"?><root><item>value</item></root>';
      
      const params: HttpRequestNodeParameters = {
        url: 'https://api.example.com/xml',
        method: 'POST',
        body: stringBody,
        headers: { 'Content-Type': 'application/xml' }
      };
      
      const request = new HttpRequest(params);
      expect(request.getBody()).toBe(stringBody);
    });

    it('should handle zero timeout and retries', () => {
      const params: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET',
        timeout: 1000, // Minimum valid timeout
        retries: 0
      };
      
      const request = new HttpRequest(params);
      const validation = request.validate();
      expect(validation.valid).toBe(true);
      expect(request.getTimeout()).toBe(1000);
    });

    it('should handle missing authentication fields gracefully', () => {
      const incompleteAuth = { type: 'bearer' } as HttpRequestNodeParameters['authentication'];
      
      const params: HttpRequestNodeParameters = {
        url: 'https://api.example.com/test',
        method: 'GET',
        authentication: incompleteAuth
      };
      
      const request = new HttpRequest(params);
      expect(request.getParameters().authentication).toEqual({ type: 'bearer' });
    });
  });
});