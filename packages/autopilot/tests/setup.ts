/**
 * Jest setup file for autopilot package tests
 */

import type { Blueprint, Execution } from '../src/types';
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

(global as any).createMockExecution = (overrides: Partial<Execution> = {}): Execution => ({
  status: 'not_started',
  executionResults: new Map(),
  ...overrides
});


// Setup common test timeouts
jest.setTimeout(10000);