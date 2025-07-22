/**
 * Jest Setup Utilities for @starships/protocol
 * 
 * Provides helper functions and test data factories for protocol type testing.
 */

import * as ProtocolTypes from '../src/index';

// Test data factories for creating valid protocol objects
export const TestDataFactory = {
  /**
   * Creates a valid UsageStats object
   */
  createUsageStats: (overrides: Partial<ProtocolTypes.UsageStats> = {}): ProtocolTypes.UsageStats => ({
    prompt_tokens: 150,
    completion_tokens: 75,
    ...overrides,
  }),

  /**
   * Creates a valid ChatRequest object
   */
  createChatRequest: (overrides: Partial<ProtocolTypes.ChatRequest> = {}): ProtocolTypes.ChatRequest => ({
    agent_id: 'test-agent-123',
    user_id: 'test-user-456',
    message: 'Test message content',
    stream: false,
    ...overrides,
  }),

  /**
   * Creates a valid ChatResponse object
   */
  createChatResponse: (overrides: Partial<ProtocolTypes.ChatResponse> = {}): ProtocolTypes.ChatResponse => ({
    reply: 'Test response content',
    usage: TestDataFactory.createUsageStats(),
    ...overrides,
  }),

  /**
   * Creates a valid Agent object
   */
  createAgent: (overrides: Partial<ProtocolTypes.Agent> = {}): ProtocolTypes.Agent => ({
    id: 'agent-123',
    name: 'Test Agent',
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant.',
    createdAt: '2024-01-01T00:00:00Z',
    description: 'Test agent description',
    tags: ['test', 'development'],
    category: 'general' as const,
    authorId: 'user-123',
    isPublic: true,
    version: '1.0.0',
    updatedAt: '2024-01-01T00:00:00Z',
    usageCount: 0,
    starshipId: 'starship-123',
    ...overrides,
  }),

  /**
   * Creates a valid CreateAgentRequest object
   */
  createAgentRequest: (overrides: Partial<ProtocolTypes.CreateAgentRequest> = {}): ProtocolTypes.CreateAgentRequest => ({
    name: 'Test Agent',
    description: 'Test agent description',
    category: 'general' as const,
    systemPrompt: 'You are a helpful assistant.',
    model: 'gpt-4',
    tags: ['test'],
    isPublic: true,
    starshipId: 'starship-123',
    ...overrides,
  }),

  /**
   * Creates a valid SibilRequest object
   */
  createSibilRequest: (overrides: Partial<ProtocolTypes.SibilRequest> = {}): ProtocolTypes.SibilRequest => ({
    provider: 'openai',
    model: 'gpt-4',
    message: 'Test message',
    user_id: 'user-123',
    ...overrides,
  }),

  /**
   * Creates a valid SibilResponse object
   */
  createSibilResponse: (overrides: Partial<ProtocolTypes.SibilResponse> = {}): ProtocolTypes.SibilResponse => ({
    content: 'Test response content',
    provider: 'openai',
    model: 'gpt-4',
    usage: TestDataFactory.createUsageStats(),
    ...overrides,
  }),

  /**
   * Creates a valid ContentBlock object
   */
  createContentBlock: (overrides: Partial<ProtocolTypes.ContentBlock> = {}): ProtocolTypes.ContentBlock => ({
    type: 'text',
    content: 'Test content',
    ...overrides,
  }),
};

// Validation utilities
export const ValidationUtils = {
  /**
   * Validates that a string is a valid ISO 8601 timestamp
   */
  isValidTimestamp: (value: string): boolean => {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
    if (!iso8601Regex.test(value)) return false;
    
    const date = new Date(value);
    return date.toISOString() === value;
  },

  /**
   * Validates that a string is a valid UUID
   */
  isValidUUID: (value: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  },

  /**
   * Validates that a string is a valid slug format
   */
  isValidSlug: (value: string): boolean => {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  },

  /**
   * Validates that an object can be serialized and deserialized
   */
  isSerializable: (obj: any): boolean => {
    try {
      const serialized = JSON.stringify(obj);
      const deserialized = JSON.parse(serialized);
      return JSON.stringify(deserialized) === serialized;
    } catch {
      return false;
    }
  },

  /**
   * Validates that an object has all required fields
   */
  hasRequiredFields: (obj: any, fields: string[]): { isValid: boolean; missingFields: string[] } => {
    const missingFields = fields.filter(field => !(field in obj) || obj[field] === undefined);
    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  },

  /**
   * Validates that an enum value is valid
   */
  isValidEnumValue: <T>(value: any, enumObject: Record<string, T>): value is T => {
    return Object.values(enumObject).includes(value);
  },
};

// Type assertion helpers
export const TypeAssertions = {
  /**
   * Asserts that an object conforms to UsageStats interface
   */
  assertUsageStats: (obj: any): asserts obj is ProtocolTypes.UsageStats => {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error('Expected object to be UsageStats');
    }
    if (typeof obj.prompt_tokens !== 'number' || obj.prompt_tokens < 0) {
      throw new Error('prompt_tokens must be a non-negative number');
    }
    if (typeof obj.completion_tokens !== 'number' || obj.completion_tokens < 0) {
      throw new Error('completion_tokens must be a non-negative number');
    }
  },

  /**
   * Asserts that an object conforms to Agent interface
   */
  assertAgent: (obj: any): asserts obj is ProtocolTypes.Agent => {
    const requiredStringFields = ['id', 'name', 'model', 'createdAt', 'authorId', 'version', 'updatedAt', 'starshipId'];
    const requiredArrayFields = ['tags'];
    
    for (const field of requiredStringFields) {
      if (typeof obj[field] !== 'string' || obj[field].length === 0) {
        throw new Error(`${field} must be a non-empty string`);
      }
    }
    
    for (const field of requiredArrayFields) {
      if (!Array.isArray(obj[field])) {
        throw new Error(`${field} must be an array`);
      }
    }

    const validCategories = ['general', 'coding', 'creative', 'analysis', 'support'];
    if (!validCategories.includes(obj.category)) {
      throw new Error(`category must be one of: ${validCategories.join(', ')}`);
    }

    if (typeof obj.isPublic !== 'boolean') {
      throw new Error('isPublic must be a boolean');
    }

    if (typeof obj.usageCount !== 'number' || obj.usageCount < 0) {
      throw new Error('usageCount must be a non-negative number');
    }
  },
};

// Mock data generators for complex scenarios
export const MockDataGenerators = {
  /**
   * Generates multiple agents with varying properties
   */
  generateAgents: (count: number = 5): ProtocolTypes.Agent[] => {
    const categories: ProtocolTypes.Agent['category'][] = ['general', 'coding', 'creative', 'analysis', 'support'];
    const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet'];
    
    return Array.from({ length: count }, (_, index) => 
      TestDataFactory.createAgent({
        id: `agent-${index + 1}`,
        name: `Test Agent ${index + 1}`,
        category: categories[index % categories.length],
        model: models[index % models.length],
        tags: [`tag-${index + 1}`, 'test'],
        usageCount: Math.floor(Math.random() * 100),
      })
    );
  },

  /**
   * Generates Socket.IO event data for testing
   */
  generateSocketEvent: (eventType: string, data: any = {}) => ({
    type: eventType,
    timestamp: new Date().toISOString(),
    userId: 'test-user-123',
    ...data,
  }),
};