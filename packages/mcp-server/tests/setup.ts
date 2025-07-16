/// <reference types="jest" />
import { v4 } from 'uuid';

// Mock UUID for predictable IDs
jest.mock('uuid');

// Mock Docker for testing
jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => ({
    createContainer: jest.fn().mockResolvedValue({
      id: 'mock-container-id',
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      inspect: jest.fn().mockResolvedValue({
        State: { Status: 'running' },
        Config: { Image: 'mock-image' },
        NetworkSettings: { IPAddress: '172.17.0.2' }
      }),
      logs: jest.fn().mockResolvedValue('Mock container logs'),
      stats: jest.fn().mockResolvedValue({
        memory_stats: { usage: 1024 * 1024 * 100 }, // 100MB
        cpu_stats: { cpu_usage: { total_usage: 1000000 } }
      })
    }),
    listContainers: jest.fn().mockResolvedValue([]),
    getContainer: jest.fn().mockReturnValue({
      inspect: jest.fn().mockResolvedValue({
        State: { Status: 'running' },
        Config: { Image: 'mock-image' }
      }),
      stop: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    }),
    ping: jest.fn().mockResolvedValue(undefined)
  }));
});

// Mock @starships/models
jest.mock('@starships/models', () => ({
  createConnection: jest.fn(),
  getConnection: jest.fn(),
  RepositoryFactory: {
    getMCPRepository: jest.fn(() => ({
      createMCPServer: jest.fn(),
      findMCPServerByUser: jest.fn().mockResolvedValue([]),
      findMCPServerByAgent: jest.fn().mockResolvedValue(null),
      updateMCPServer: jest.fn(),
      deleteMCPServer: jest.fn(),
      createTool: jest.fn(),
      findToolsByServer: jest.fn().mockResolvedValue([]),
      findToolByName: jest.fn().mockResolvedValue(null),
      updateTool: jest.fn(),
      deleteTool: jest.fn(),
      createContainer: jest.fn(),
      findContainersByUser: jest.fn().mockResolvedValue([]),
      findContainerByServer: jest.fn().mockResolvedValue(null),
      updateContainer: jest.fn(),
      deleteContainer: jest.fn(),
      grantPermission: jest.fn(),
      revokePermission: jest.fn(),
      checkPermission: jest.fn().mockResolvedValue(true),
      listUserPermissions: jest.fn().mockResolvedValue([]),
      setAgentToolCredentials: jest.fn(),
      getAgentToolCredentials: jest.fn().mockResolvedValue({}),
      checkAgentToolPermission: jest.fn().mockResolvedValue(true)
    }))
  }
}));

// Mock crypto for encryption testing
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn().mockReturnValue(Buffer.from('mock-random-bytes')),
  createCipher: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue('encrypted-'),
    final: jest.fn().mockReturnValue('data')
  }),
  createDecipher: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue('decrypted-'),
    final: jest.fn().mockReturnValue('data')
  })
}));

beforeEach(() => {
  // Reset UUID counter for each test
  let idCounter = 1;
  (v4 as jest.Mock).mockImplementation(() => `test-uuid-${idCounter++}`);
  
  // Reset all mocks
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
(global as any).mockMCPServer = {
  id: 'test-mcp-server-1',
  userId: 'test-user-1',
  name: 'Test MCP Server',
  containerImage: 'starships-mcp-tools:latest',
  status: 'running' as const,
  environment: { NODE_ENV: 'test' },
  limits: {
    memory: '512m',
    cpu: '0.5',
    timeout: 30000
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

(global as any).mockMCPTool = {
  id: 'test-tool-1',
  serverId: 'test-mcp-server-1',
  name: 'web_scraper',
  description: 'Scrape web content',
  parameters: {
    url: { type: 'string', required: true },
    selector: { type: 'string', required: false }
  },
  permissions: ['web_access'],
  category: 'data' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

(global as any).mockMCPContainer = {
  id: 'test-container-1',
  serverId: 'test-mcp-server-1',
  userId: 'test-user-1',
  dockerId: 'mock-container-id',
  status: 'running' as const,
  image: 'starships-mcp-tools:latest',
  ports: { '8080': 8080 },
  resourceUsage: {
    memory: '100MB',
    cpu: '0.1'
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  lastActivity: '2024-01-01T00:00:00.000Z'
};

(global as any).mockMCPToolCall = {
  id: 'test-tool-call-1',
  toolName: 'web_scraper',
  parameters: { url: 'https://example.com' },
  agentId: 'test-agent-1',
  userId: 'test-user-1',
  timestamp: '2024-01-01T00:00:00.000Z'
};

(global as any).mockMCPToolResult = {
  id: 'test-tool-result-1',
  toolCallId: 'test-tool-call-1',
  success: true,
  result: { content: 'Scraped content' },
  executionTime: 1500,
  timestamp: '2024-01-01T00:00:00.000Z'
};