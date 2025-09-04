/**
 * Configuration Constants Unit Tests
 */

import { config, ConfigKey } from '../index';

describe('Configuration Constants', () => {
  describe('config object', () => {
    it('should have all expected configuration keys', () => {
      const expectedKeys = [
        'APPROVAL_TIMEOUT',
        'EXECUTION_TIMEOUT',
        'USER_PROMPT_TIMEOUT',
        'AGENT_EXECUTION_TIMEOUT',
        'MAX_NODES',
        'MAX_EDGES',
        'DEFAULT_RETRIES',
        'RETRY_BACKOFF_MS',
        'JSONATA_EXPRESSION_TIMEOUT_MS',
        'MAX_CONDITIONAL_DEPTH',
      ];

      const actualKeys = Object.keys(config);
      expect(actualKeys).toEqual(expectedKeys);
    });

    it('should have correct timeout values in milliseconds', () => {
      expect(config.APPROVAL_TIMEOUT).toBe(30 * 60 * 1000); // 30 minutes
      expect(config.EXECUTION_TIMEOUT).toBe(60 * 60 * 1000); // 1 hour
      expect(config.USER_PROMPT_TIMEOUT).toBe(60 * 60 * 1000); // 1 hour
      expect(config.AGENT_EXECUTION_TIMEOUT).toBe(10 * 60 * 1000); // 10 minutes
    });

    it('should have reasonable limits for workflow complexity', () => {
      expect(config.MAX_NODES).toBe(50);
      expect(config.MAX_EDGES).toBe(100);
      expect(config.MAX_CONDITIONAL_DEPTH).toBe(10);
    });

    it('should have sensible retry configuration', () => {
      expect(config.DEFAULT_RETRIES).toBe(3);
      expect(config.RETRY_BACKOFF_MS).toBe(1000);
    });

    it('should have JSONata timeout configured', () => {
      expect(config.JSONATA_EXPRESSION_TIMEOUT_MS).toBe(5000);
    });

    it('should have all values as numbers', () => {
      Object.values(config).forEach((value) => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });

    it('should be defined as readonly at compile-time', () => {
      // The `as const` assertion provides compile-time immutability
      // Runtime immutability would require Object.freeze()
      expect(typeof config.APPROVAL_TIMEOUT).toBe('number');
      expect(config.APPROVAL_TIMEOUT).toBeGreaterThan(0);
    });
  });

  describe('timeout relationships', () => {
    it('should have execution timeout longer than agent timeout', () => {
      expect(config.EXECUTION_TIMEOUT).toBeGreaterThan(config.AGENT_EXECUTION_TIMEOUT);
    });

    it('should have execution timeout equal to user prompt timeout', () => {
      expect(config.EXECUTION_TIMEOUT).toBe(config.USER_PROMPT_TIMEOUT);
    });

    it('should have approval timeout shorter than execution timeout', () => {
      expect(config.APPROVAL_TIMEOUT).toBeLessThan(config.EXECUTION_TIMEOUT);
    });
  });

  describe('limit relationships', () => {
    it('should have more edges allowed than nodes', () => {
      expect(config.MAX_EDGES).toBeGreaterThan(config.MAX_NODES);
    });

    it('should have reasonable conditional depth limit', () => {
      expect(config.MAX_CONDITIONAL_DEPTH).toBeGreaterThan(0);
      expect(config.MAX_CONDITIONAL_DEPTH).toBeLessThan(config.MAX_NODES);
    });
  });

  describe('ConfigKey type', () => {
    it('should include all config keys', () => {
      // This is a compile-time test - if ConfigKey type is wrong, TypeScript will catch it
      const allKeys: ConfigKey[] = [
        'APPROVAL_TIMEOUT',
        'EXECUTION_TIMEOUT',
        'USER_PROMPT_TIMEOUT',
        'AGENT_EXECUTION_TIMEOUT',
        'MAX_NODES',
        'MAX_EDGES',
        'DEFAULT_RETRIES',
        'RETRY_BACKOFF_MS',
        'JSONATA_EXPRESSION_TIMEOUT_MS',
        'MAX_CONDITIONAL_DEPTH',
      ];

      allKeys.forEach((key) => {
        expect(config[key]).toBeDefined();
        expect(typeof config[key]).toBe('number');
      });
    });
  });

  describe('practical usage scenarios', () => {
    it('should provide reasonable timeouts for user interactions', () => {
      // User prompt timeout should be long enough for user to respond
      expect(config.USER_PROMPT_TIMEOUT).toBeGreaterThanOrEqual(5 * 60 * 1000); // At least 5 minutes
    });

    it('should provide reasonable timeouts for agent execution', () => {
      // Agent timeout should be reasonable for AI processing
      expect(config.AGENT_EXECUTION_TIMEOUT).toBeGreaterThanOrEqual(30 * 1000); // At least 30 seconds
      expect(config.AGENT_EXECUTION_TIMEOUT).toBeLessThanOrEqual(15 * 60 * 1000); // But not more than 15 minutes
    });

    it('should provide reasonable limits for workflow size', () => {
      // Workflow should be manageable but not too restrictive
      expect(config.MAX_NODES).toBeGreaterThanOrEqual(10); // Allow meaningful workflows
      expect(config.MAX_NODES).toBeLessThanOrEqual(200); // But not too complex

      expect(config.MAX_EDGES).toBeGreaterThanOrEqual(config.MAX_NODES); // At least as many edges as nodes
    });

    it('should provide reasonable retry configuration', () => {
      expect(config.DEFAULT_RETRIES).toBeGreaterThan(0); // Should retry
      expect(config.DEFAULT_RETRIES).toBeLessThan(10); // But not too many times

      expect(config.RETRY_BACKOFF_MS).toBeGreaterThanOrEqual(100); // Some delay
      expect(config.RETRY_BACKOFF_MS).toBeLessThanOrEqual(5000); // But not too long
    });

    it('should provide reasonable JSONata timeout', () => {
      // JSONata should have enough time but not hang
      expect(config.JSONATA_EXPRESSION_TIMEOUT_MS).toBeGreaterThanOrEqual(1000); // At least 1 second
      expect(config.JSONATA_EXPRESSION_TIMEOUT_MS).toBeLessThanOrEqual(30000); // But not more than 30 seconds
    });
  });

  describe('configuration consistency', () => {
    it('should have consistent time units (all in milliseconds)', () => {
      const timeoutKeys = [
        'APPROVAL_TIMEOUT',
        'EXECUTION_TIMEOUT',
        'USER_PROMPT_TIMEOUT',
        'AGENT_EXECUTION_TIMEOUT',
        'RETRY_BACKOFF_MS',
        'JSONATA_EXPRESSION_TIMEOUT_MS',
      ];

      timeoutKeys.forEach((key) => {
        const value = config[key as ConfigKey];
        // All should be reasonable millisecond values (> 100ms, < 24 hours)
        expect(value).toBeGreaterThanOrEqual(100);
        expect(value).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
      });
    });

    it('should have consistent count limits', () => {
      const countKeys = ['MAX_NODES', 'MAX_EDGES', 'DEFAULT_RETRIES', 'MAX_CONDITIONAL_DEPTH'];

      countKeys.forEach((key) => {
        const value = config[key as ConfigKey];
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      });
    });
  });
});
