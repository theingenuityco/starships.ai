/**
 * Mock implementations for @starships/models package
 * Used in server unit tests to isolate business logic from database operations
 */

// Jest globals are available during tests, we can use the global `jest` without importing
declare const jest: any;

// Mock Repository interfaces
export const MockStarshipRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByOwner: jest.fn(),
  getDeployedAgents: jest.fn(),
  deployAgent: jest.fn(),
  removeAgent: jest.fn(),
  getAvailableSlots: jest.fn(),
  generateUniqueSlug: jest.fn(),
  isSlugAvailable: jest.fn(),
  createSlugFromName: jest.fn(),
};

export const MockMCPServerOptionRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByCommand: jest.fn(),
  findActive: jest.fn(),
  searchByName: jest.fn(),
};

export const MockMCPServerConnectorRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByStarship: jest.fn(),
  findByTemplate: jest.fn(),
  createFromTemplate: jest.fn(),
  updateStatus: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
  findByStarshipAndTemplate: jest.fn(),
  updateConfig: jest.fn(),
  applyConfigTemplate: jest.fn(),
};

export const MockUserRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByEmail: jest.fn(),
  findByKindeId: jest.fn(),
};

// Mock Error Classes
export const ValidationError = class extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
};

export const AuthenticationError = class extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
};

export const NotFoundError = class extends Error {
  constructor(message: string, public entityType?: string, public entityId?: string) {
    super(message);
    this.name = 'NotFoundError';
  }
};

// Mock Logger - calls console.log for spy testing consistency
export const logger = {
  info: jest.fn((message: string, ...args: any[]) => {
    console.log('[INFO]', message, ...args);
  }),
  error: jest.fn((message: string, ...args: any[]) => {
    console.log('[ERROR]', message, ...args);
  }),
  warn: jest.fn((message: string, ...args: any[]) => {
    console.log('[WARN]', message, ...args);
  }),
  debug: jest.fn((message: string, ...args: any[]) => {
    console.log('[DEBUG]', message, ...args);
  }),
};

// Mock Scripts
export const seedMCPServers = jest.fn().mockResolvedValue(undefined);