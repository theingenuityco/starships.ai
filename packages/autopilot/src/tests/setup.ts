/**
 * Jest setup file for autopilot package tests
 */

import type { Blueprint, Execution, Node } from '@/types';
import { AgentMemory } from '@/AgentMemory';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities with type assertions
(global as any).createMockBlueprint = (overrides: Partial<Blueprint> = {}): Blueprint => ({
  nodes: [
    { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
    { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
  ],
  edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
  metadata: {},
  ...overrides,
});

// Legacy support for tests that haven't been updated yet
(global as any).createMockWorkflow = (global as any).createMockBlueprint;

// Create AgentMemory helper
(global as any).createAgentMemory = (): AgentMemory => {
  const memory = new AgentMemory();
  memory.addMessage('system', 'Test system prompt');
  return memory;
};

(global as any).createMockExecution = (overrides: Partial<Execution> = {}): Execution => ({
  status: 'not_started',
  executionResults: new Map(),
  agentMemory: (global as any).createAgentMemory(),
  ...overrides,
});

// Create mock node helper
(global as any).createMockNode = (overrides: Partial<Node> = {}): Node => ({
  ref: 'test-node',
  type: 'start',
  name: 'Test Node',
  description: 'Test node description',
  parameters: {},
  ...overrides,
});

// Setup common test timeouts
jest.setTimeout(10000);
