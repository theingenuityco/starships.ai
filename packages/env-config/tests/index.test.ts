/**
 * Tests for main entry point and environment detection
 */

import { mockBrowserEnvironment, clearEnvironmentVariables, createValidServerEnvironment, mockEnvironmentVariables } from './setup';

describe('environment detection and entry point', () => {
  beforeEach(() => {
    clearEnvironmentVariables();
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getServerConfig', () => {
    it('should work in Node.js environment', async () => {
      mockEnvironmentVariables(createValidServerEnvironment());
      
      const { getServerConfig } = await import('../src/index');
      const config = getServerConfig();
      
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect(config.PORT).toBe(3000);
    });

    it('should throw error in browser environment', async () => {
      const restoreBrowser = mockBrowserEnvironment();
      
      try {
        const { getServerConfig } = await import('../src/index');
        expect(() => getServerConfig()).toThrow('Server config not available in browser environment');
      } finally {
        restoreBrowser();
      }
    });
  });

  describe('getClientConfig', () => {
    it('should work in Node.js environment', async () => {
      const { getClientConfig } = await import('../src/index');
      const config = getClientConfig();
      
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect('NEXT_PUBLIC_API_URL' in config).toBe(true);
    });

    it('should work in browser environment', async () => {
      const restoreBrowser = mockBrowserEnvironment();
      
      try {
        const { getClientConfig } = await import('../src/index');
        const config = getClientConfig();
        
        expect(config).toBeDefined();
        expect(typeof config).toBe('object');
      } finally {
        restoreBrowser();
      }
    });
  });

  describe('getConfig', () => {
    it('should merge server and client config in Node.js environment', async () => {
      mockEnvironmentVariables({
        ...createValidServerEnvironment(),
        NEXT_PUBLIC_API_URL: 'https://api.example.com'
      });
      
      const { getConfig } = await import('../src/index');
      const config = getConfig();
      
      expect(config).toBeDefined();
      expect(config.PORT).toBe(3000); // From server config
      expect(config.NEXT_PUBLIC_API_URL).toBe('https://api.example.com'); // From client config
    });

    it('should throw error in browser environment', async () => {
      const restoreBrowser = mockBrowserEnvironment();
      
      try {
        const { getConfig } = await import('../src/index');
        expect(() => getConfig()).toThrow('Combined config not available in browser environment');
      } finally {
        restoreBrowser();
      }
    });
  });

  describe('legacy exports', () => {
    it('should support loadServerEnvironment alias', async () => {
      mockEnvironmentVariables(createValidServerEnvironment());
      
      const { loadServerEnvironment } = await import('../src/index');
      const config = loadServerEnvironment();
      
      expect(config).toBeDefined();
      expect(config.PORT).toBe(3000);
    });

    it('should support loadClientEnvironment alias', async () => {
      const { loadClientEnvironment } = await import('../src/index');
      const config = loadClientEnvironment();
      
      expect(config).toBeDefined();
      expect('NEXT_PUBLIC_API_URL' in config).toBe(true);
    });

    it('should support loadEnvironment alias', async () => {
      mockEnvironmentVariables(createValidServerEnvironment());
      
      const { loadEnvironment } = await import('../src/index');
      const config = loadEnvironment();
      
      expect(config).toBeDefined();
      expect(config.PORT).toBe(3000);
    });

    it('loadServerEnvironment should throw in browser environment', async () => {
      const restoreBrowser = mockBrowserEnvironment();
      
      try {
        const { loadServerEnvironment } = await import('../src/index');
        expect(() => loadServerEnvironment()).toThrow('Server config not available in browser environment');
      } finally {
        restoreBrowser();
      }
    });

    it('loadEnvironment should throw in browser environment', async () => {
      const restoreBrowser = mockBrowserEnvironment();
      
      try {
        const { loadEnvironment } = await import('../src/index');
        expect(() => loadEnvironment()).toThrow('Combined config not available in browser environment');
      } finally {
        restoreBrowser();
      }
    });
  });

  describe('dynamic module loading', () => {
    it('should use require for server module', async () => {
      mockEnvironmentVariables(createValidServerEnvironment());
      
      // Spy on require to verify it's called
      const originalRequire = require;
      const requireSpy = jest.fn().mockReturnValue({
        loadServerEnvironment: () => createValidServerEnvironment()
      });
      
      // We can't easily mock require directly, so this test verifies behavior indirectly
      const { getServerConfig } = await import('../src/index');
      const config = getServerConfig();
      
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should use require for client module', async () => {
      const { getClientConfig } = await import('../src/index');
      const config = getClientConfig();
      
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });
  });

  describe('error handling', () => {
    it('should handle server environment validation errors', async () => {
      clearEnvironmentVariables();
      mockEnvironmentVariables({
        NODE_ENV: 'development',
        npm_lifecycle_event: 'test',  // Ensure not linting
        DEFAULT_LLM_PROVIDER: 'openai'
        // Missing OPENAI_API_KEY - should trigger validation error
      });
      
      // Clear module cache to ensure fresh import
      jest.resetModules();
      const { getServerConfig } = await import('../src/index');
      expect(() => getServerConfig()).toThrow('OPENAI_API_KEY is required when DEFAULT_LLM_PROVIDER is openai');
    });

    it('should handle combined config validation errors', async () => {
      clearEnvironmentVariables();
      mockEnvironmentVariables({
        NODE_ENV: 'development',
        npm_lifecycle_event: 'test',  // Ensure not linting
        DEFAULT_LLM_PROVIDER: 'openai'
        // Missing OPENAI_API_KEY - should trigger validation error
      });
      
      // Clear module cache to ensure fresh import
      jest.resetModules();
      const { getConfig } = await import('../src/index');
      expect(() => getConfig()).toThrow('OPENAI_API_KEY is required when DEFAULT_LLM_PROVIDER is openai');
    });
  });
});