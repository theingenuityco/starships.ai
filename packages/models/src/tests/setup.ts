/**
 * Jest setup file for models package tests
 */

import { ConflictError, DatabaseError, NotFoundError, ValidationError } from '@starships/errors';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn() as jest.MockedFunction<typeof console.log>,
  warn: jest.fn() as jest.MockedFunction<typeof console.warn>,
  error: jest.fn() as jest.MockedFunction<typeof console.error>,
  debug: jest.fn() as jest.MockedFunction<typeof console.debug>,
  info: jest.fn() as jest.MockedFunction<typeof console.info>,
};

// Mock neo4j driver for database operations
const mockDriver = {
  session: jest.fn(() => ({
    run: jest.fn(),
    close: jest.fn(),
  })),
  close: jest.fn(),
};

// Global test utilities
(global as Record<string, unknown>).createMockDriver = () => mockDriver;

// Mock user data
(global as Record<string, unknown>).createMockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

// Mock starship data
(global as Record<string, unknown>).createMockStarship = (overrides: Record<string, unknown> = {}) => ({
  id: 'starship-123',
  name: 'Test Starship',
  slug: 'test-starship',
  ownerId: 'user-123',
  class: 'scout',
  maxAgents: 3,
  status: 'active',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

// Mock agent data
(global as Record<string, unknown>).createMockAgent = (overrides: Record<string, unknown> = {}) => ({
  id: 'agent-123',
  name: 'Test Agent',
  description: 'A test agent',
  type: 'assistant',
  starshipId: 'starship-123',
  userId: 'user-123',
  systemPrompt: 'You are a helpful assistant',
  configuration: {},
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

// Mock conversation data
(global as Record<string, unknown>).createMockConversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'conversation-123',
  title: 'Test Conversation',
  status: 'active',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

// Mock message data
(global as Record<string, unknown>).createMockMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'message-123',
  conversationId: 'conversation-123',
  role: 'user',
  content: 'Hello, world!',
  timestamp: '2024-01-01T00:00:00.000Z',
  metadata: {},
  ...overrides,
});

// Mock workflow/blueprint data
(global as Record<string, unknown>).createMockBlueprint = (overrides: Record<string, unknown> = {}) => ({
  id: 'blueprint-123',
  name: 'Test Blueprint',
  description: 'A test blueprint',
  userId: 'user-123',
  starshipId: 'starship-123',
  nodes: [],
  edges: [],
  metadata: {},
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

// Mock execution data
(global as Record<string, unknown>).createMockExecution = (overrides: Record<string, unknown> = {}) => ({
  id: 'execution-123',
  blueprintId: 'blueprint-123',
  starshipId: 'starship-123',
  userId: 'user-123',
  status: 'pending',
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: null,
  result: null,
  error: null,
  ...overrides,
});

// Error creation helpers
(global as Record<string, unknown>).createValidationError = (message = 'Validation failed', field = 'testField') =>
  new ValidationError(message, field);

(global as Record<string, unknown>).createNotFoundError = (entityType = 'TestEntity', entityId = 'test-123') =>
  new NotFoundError(entityType, entityId);

(global as Record<string, unknown>).createDatabaseError = (operation = 'test') => new DatabaseError(operation);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
(global as Record<string, unknown>).createConflictError = (message = 'Resource conflict', conflictType = 'duplicate') =>
  new ConflictError(message);

// Mock database session with common patterns
(global as Record<string, unknown>).createMockDatabaseSession = () => {
  const session = {
    run: jest.fn(),
    close: jest.fn(),
  };

  // Common return patterns for different query types
  session.run.mockImplementation((query: string) => {
    if (query.includes('CREATE')) {
      return Promise.resolve({ records: [] });
    }
    if (query.includes('MATCH')) {
      return Promise.resolve({ records: [] });
    }
    if (query.includes('DELETE')) {
      return Promise.resolve({ summary: { counters: { nodesDeleted: 1 } } });
    }
    return Promise.resolve({ records: [] });
  });

  return session;
};

// Mock repository error scenarios
(global as Record<string, unknown>).mockRepositoryError = (session: Record<string, unknown>, errorType: string) => {
  const mockSession = session as { run: { mockRejectedValue: (error: Error) => void } };
  switch (errorType) {
    case 'constraint':
      mockSession.run.mockRejectedValue(new Error('constraint violation'));
      break;
    case 'connection':
      mockSession.run.mockRejectedValue(new Error('connection failed'));
      break;
    case 'timeout':
      mockSession.run.mockRejectedValue(new Error('operation timeout'));
      break;
    case 'query':
      mockSession.run.mockRejectedValue(new Error('syntax error in query'));
      break;
    default:
      mockSession.run.mockRejectedValue(new Error('unknown database error'));
  }
};

// Mock successful repository operations
(global as Record<string, unknown>).mockRepositorySuccess = (session: Record<string, unknown>, data: unknown) => {
  const mockSession = session as { run: { mockResolvedValue: (value: unknown) => void } };
  mockSession.run.mockResolvedValue({
    records: data ? [{ get: () => data }] : [],
  });
};

// Setup common test timeouts
jest.setTimeout(10000);

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock nanoid generation for predictable testing
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-nanoid-123'),
}));
