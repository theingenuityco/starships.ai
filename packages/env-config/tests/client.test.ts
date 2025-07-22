/**
 * Tests for client environment configuration loading
 */

import { loadClientEnvironment } from '../src/client';
import { mockEnvironmentVariables, clearEnvironmentVariables } from './setup';

describe('client environment configuration', () => {
  beforeEach(() => {
    clearEnvironmentVariables();
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadClientEnvironment', () => {
    it('should return undefined for NEXT_PUBLIC_API_URL when not set', () => {
      const config = loadClientEnvironment();
      expect(config.NEXT_PUBLIC_API_URL).toBeUndefined();
    });

    it('should return the value for NEXT_PUBLIC_API_URL when set', () => {
      mockEnvironmentVariables({ 
        NEXT_PUBLIC_API_URL: 'https://api.example.com' 
      });
      
      const config = loadClientEnvironment();
      expect(config.NEXT_PUBLIC_API_URL).toBe('https://api.example.com');
    });

    it('should handle empty string NEXT_PUBLIC_API_URL', () => {
      mockEnvironmentVariables({ 
        NEXT_PUBLIC_API_URL: '' 
      });
      
      const config = loadClientEnvironment();
      expect(config.NEXT_PUBLIC_API_URL).toBe('');
    });

    it('should be safe to run in browser-like environment', () => {
      // Mock browser-like environment
      const originalWindow = (global as any).window;
      (global as any).window = {};
      
      try {
        expect(() => loadClientEnvironment()).not.toThrow();
        const config = loadClientEnvironment();
        expect(config).toBeDefined();
      } finally {
        // Restore original environment
        if (originalWindow) {
          (global as any).window = originalWindow;
        } else {
          delete (global as any).window;
        }
      }
    });

    it('should return consistent structure', () => {
      const config = loadClientEnvironment();
      expect(typeof config).toBe('object');
      expect('NEXT_PUBLIC_API_URL' in config).toBe(true);
    });
  });
});