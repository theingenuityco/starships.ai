/**
 * Jest Setup for Tool Tests
 * Configuration and global setup for tool testing with autopilot
 */

import 'reflect-metadata';

// Mock console methods to reduce test noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Reduce console noise during tests
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore original console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test configuration
jest.setTimeout(30000); // 30 second timeout for tool execution tests

// Mock process.env for tests that don't provide explicit mock env
const originalEnv = process.env;

beforeEach(() => {
  // Reset environment for each test
  process.env = { ...originalEnv };
});

afterEach(() => {
  // Restore original environment
  process.env = originalEnv;
  jest.clearAllMocks();
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveValidToolStructure(): R;
      toHaveValidBlueprint(): R;
    }
  }
}

// Add custom Jest matchers for tool testing
beforeAll(() => {
  expect.extend({
    toHaveValidToolStructure(received) {
      const isValid =
        received &&
        typeof received.name === 'string' &&
        typeof received.description === 'string' &&
        typeof received.parameters === 'object' &&
        typeof received.blueprint === 'object';

      return {
        message: () => `Expected tool to have valid structure`,
        pass: isValid,
      };
    },

    toHaveValidBlueprint(received) {
      const isValid =
        received &&
        Array.isArray(received.nodes) &&
        Array.isArray(received.edges) &&
        received.nodes.some((n: any) => n.type === 'start') &&
        received.nodes.some((n: any) => n.type === 'end');

      return {
        message: () => `Expected blueprint to be valid`,
        pass: isValid,
      };
    },
  });
});

// Export test utilities
export const TestUtils = {
  /**
   * Create a mock environment for API-based tools
   */
  createMockApiEnv: () => ({
    BASE_URL: 'https://api.test.com',
    AUTH_TOKEN: 'mock-auth-token',
    STARSHIP_ID: 'test-starship-123',
  }),

  /**
   * Wait for a specified amount of time
   */
  wait: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),

  /**
   * Create a simple test input for tool execution
   */
  createTestInput: (data: Record<string, unknown>) => data,

  /**
   * Assert that a tool execution result is successful
   */
  assertSuccessfulExecution: (result: { success: boolean; error?: string }) => {
    if (!result.success) {
      throw new Error(`Tool execution failed: ${result.error || 'Unknown error'}`);
    }
  },

  /**
   * Assert that a tool execution result failed with expected error
   */
  assertFailedExecution: (result: { success: boolean; error?: string }, expectedError?: string) => {
    expect(result.success).toBe(false);
    if (expectedError) {
      expect(result.error).toContain(expectedError);
    }
  },
};
