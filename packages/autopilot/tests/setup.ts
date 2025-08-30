/**
 * Jest setup file for autopilot package tests
 */

import type { Blueprint } from '../src/types';
import type { ExecutionContext } from '../src/types';
// import './global.d.ts';

// Import Jest types for global availability
// import '@types/jest';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test utilities with type assertions
(global as any).createMockBlueprint = (overrides: Partial<Blueprint> = {}): Blueprint => ({
  nodes: [
    { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
    { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
  ],
  edges: [
    { ref: 'edge-1', from: 'start', to: 'end' }
  ],
  metadata: {},
  ...overrides
});

// Legacy support for tests that haven't been updated yet
(global as any).createMockWorkflow = (global as any).createMockBlueprint;

(global as any).createMockContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
  userId: 'test-user',
  previousResults: new Map(),
  expeditionState: {},
  services: {},
  ...overrides
});

// Setup common test timeouts
jest.setTimeout(10000);