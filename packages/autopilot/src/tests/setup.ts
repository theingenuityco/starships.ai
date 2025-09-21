/**
 * Jest setup file for autopilot package tests
 */

import type { Blueprint, Execution, Node, ExecutionItem } from '@/types';

// Mock nanoid for consistent ID generation in tests
let nanoidCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => `mock-nanoid-autopilot-${++nanoidCounter}`),
}));

// Console methods are not mocked to allow debug logging

// Global test utilities with type assertions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).createMockBlueprint = (overrides: Partial<Blueprint> = {}): Blueprint => ({
  nodes: [
    { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
    { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
  ],
  edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
  metadata: {},
  ...overrides,
});

// Legacy support for tests that haven't been updated yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).createMockWorkflow = (globalThis as any).createMockBlueprint;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).createMockExecution = (overrides: Partial<Execution> = {}): Execution => ({
  status: 'not_started',
  results: [],
  state: {},
  ...overrides,
});

// Create mock node helper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).createMockNode = (overrides: Partial<Node> = {}): Node => ({
  ref: 'test-node',
  type: 'start',
  name: 'Test Node',
  description: 'Test node description',
  parameters: {},
  ...overrides,
});

// Helper functions for ExecutionItem testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).createMockExecutionItem = (data: unknown, overrides: Partial<ExecutionItem> = {}): ExecutionItem => ({
  json: data,
  pairedItem: { item: 0 },
  ...overrides,
});

// Extract data from ExecutionItem array for easy testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).extractExecutionData = (items: ExecutionItem[]): unknown[] => {
  return items.map((item) => item.json);
};

// Extract single data from ExecutionItem array
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).extractSingleExecutionData = (items: ExecutionItem[]): unknown => {
  return items.length > 0 ? items[0].json : undefined;
};

// Custom matcher for ExecutionItem arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).expectExecutionItemData = (items: ExecutionItem[], expectedData: unknown): void => {
  expect(items).toHaveLength(1);
  expect(items[0].json).toEqual(expectedData);
};

// Setup common test timeouts
jest.setTimeout(10000);
