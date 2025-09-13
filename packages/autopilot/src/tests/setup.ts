/**
 * Jest setup file for autopilot package tests
 */

import { AgentMemory } from '@/AgentMemory';
import type { Blueprint, Execution, Node } from '@/types';

// Mock nanoid for consistent ID generation in tests
let nanoidCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => `mock-nanoid-autopilot-${++nanoidCounter}`),
}));

// Mock console methods to reduce noise in tests
const mockConsole = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
global.console = mockConsole;

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

// Create AgentMemory helper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).createAgentMemory = (): AgentMemory => {
  const memory = new AgentMemory();
  memory.addMessageToHistory({ role: 'system', content: 'Test system prompt' });
  return memory;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).createMockExecution = (overrides: Partial<Execution> = {}): Execution => ({
  status: 'not_started',
  results: new Map(),
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

// Setup common test timeouts
jest.setTimeout(10000);
