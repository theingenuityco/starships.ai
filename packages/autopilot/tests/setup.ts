/**
 * Jest setup file for autopilot package tests
 */

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test utilities
global.createMockBlueprint = (overrides = {}) => ({
  id: 'test-blueprint',
  nodes: [
    { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
    { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
  ],
  edges: [
    { id: 'edge-1', from: 'start', to: 'end' }
  ],
  metadata: {},
  ...overrides
});

// Legacy support for tests that haven't been updated yet
global.createMockWorkflow = global.createMockBlueprint;

global.createMockContext = (overrides = {}) => ({
  workflowId: 'test-blueprint',
  userId: 'test-user',
  previousResults: new Map(),
  expeditionState: {},
  services: {},
  ...overrides
});

// Setup common test timeouts
jest.setTimeout(10000);