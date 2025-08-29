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
global.createMockWorkflow = (overrides = {}) => ({
  id: 'test-workflow',
  expeditionId: 'test-expedition',
  nodes: [
    { id: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
    { id: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} }
  ],
  edges: [
    { id: 'edge-1', from: 'start', to: 'end' }
  ],
  approvalStatus: 'approved',
  visualization: '',
  createdAt: new Date().toISOString(),
  ...overrides
});

global.createMockContext = (overrides = {}) => ({
  expeditionId: 'test-expedition',
  workflowId: 'test-workflow',
  userId: 'test-user',
  previousResults: new Map(),
  expeditionState: {},
  services: {},
  ...overrides
});

// Setup common test timeouts
jest.setTimeout(10000);