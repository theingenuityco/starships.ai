/**
 * Core Interface Tests for @starships/protocol
 * 
 * Tests for basic protocol interfaces including UsageStats, ChatRequest/Response,
 * Agent interfaces, and core type validations.
 */

import {
  UsageStats,
  ChatRequest,
  ChatResponse,
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentConfig,
  MemoryEntry,
  EnhancedMemoryEntry,
  MemorySearchResult,
  LLMChatPrompt,
  LLMResult,
  LLMProvider
} from '../src/index';

import { TestDataFactory, ValidationUtils, TypeAssertions } from './setup';

describe('Core Protocol Interfaces', () => {
  describe('UsageStats', () => {
    it('should validate required fields for UsageStats', () => {
      const usageStats = TestDataFactory.createUsageStats();
      
      expect(usageStats).toHaveProperty('prompt_tokens');
      expect(usageStats).toHaveProperty('completion_tokens');
      expect(typeof usageStats.prompt_tokens).toBe('number');
      expect(typeof usageStats.completion_tokens).toBe('number');
      expect(usageStats.prompt_tokens).toBeGreaterThanOrEqual(0);
      expect(usageStats.completion_tokens).toBeGreaterThanOrEqual(0);
    });

    it('should be serializable', () => {
      const usageStats = TestDataFactory.createUsageStats({
        prompt_tokens: 100,
        completion_tokens: 50
      });
      
      expect(ValidationUtils.isSerializable(usageStats)).toBe(true);
    });

    it('should validate with TypeAssertions', () => {
      const usageStats = TestDataFactory.createUsageStats();
      expect(() => TypeAssertions.assertUsageStats(usageStats)).not.toThrow();
    });

    it('should reject negative token counts', () => {
      const invalidUsageStats = { prompt_tokens: -1, completion_tokens: 50 };
      expect(() => TypeAssertions.assertUsageStats(invalidUsageStats)).toThrow('prompt_tokens must be a non-negative number');
    });
  });

  describe('ChatRequest', () => {
    it('should validate required fields for ChatRequest', () => {
      const chatRequest = TestDataFactory.createChatRequest();
      
      const requiredFields = ['agent_id', 'user_id', 'message'];
      const validation = ValidationUtils.hasRequiredFields(chatRequest, requiredFields);
      
      expect(validation.isValid).toBe(true);
      expect(validation.missingFields).toHaveLength(0);
    });

    it('should have correct field types', () => {
      const chatRequest = TestDataFactory.createChatRequest();
      
      expect(typeof chatRequest.agent_id).toBe('string');
      expect(typeof chatRequest.user_id).toBe('string');
      expect(typeof chatRequest.message).toBe('string');
      expect(chatRequest.agent_id.length).toBeGreaterThan(0);
      expect(chatRequest.user_id.length).toBeGreaterThan(0);
      expect(chatRequest.message.length).toBeGreaterThan(0);
    });

    it('should handle optional fields correctly', () => {
      const chatRequest = TestDataFactory.createChatRequest({
        channel_id: 'channel-123',
        stream: true
      });
      
      expect(chatRequest.channel_id).toBe('channel-123');
      expect(chatRequest.stream).toBe(true);
    });

    it('should be serializable', () => {
      const chatRequest = TestDataFactory.createChatRequest();
      expect(ValidationUtils.isSerializable(chatRequest)).toBe(true);
    });
  });

  describe('ChatResponse', () => {
    it('should validate required fields for ChatResponse', () => {
      const chatResponse = TestDataFactory.createChatResponse();
      
      expect(chatResponse).toHaveProperty('reply');
      expect(typeof chatResponse.reply).toBe('string');
      expect(chatResponse.reply.length).toBeGreaterThan(0);
    });

    it('should handle optional usage field', () => {
      const chatResponseWithUsage = TestDataFactory.createChatResponse({
        usage: TestDataFactory.createUsageStats()
      });
      
      expect(chatResponseWithUsage.usage).toBeDefined();
      expect(() => TypeAssertions.assertUsageStats(chatResponseWithUsage.usage!)).not.toThrow();
      
      const chatResponseWithoutUsage = TestDataFactory.createChatResponse({
        usage: undefined
      });
      
      expect(chatResponseWithoutUsage.usage).toBeUndefined();
    });

    it('should be serializable', () => {
      const chatResponse = TestDataFactory.createChatResponse();
      expect(ValidationUtils.isSerializable(chatResponse)).toBe(true);
    });
  });

  describe('Agent', () => {
    it('should validate all required fields for Agent', () => {
      const agent = TestDataFactory.createAgent();
      
      const requiredFields = [
        'id', 'name', 'model', 'createdAt', 'tags', 'category', 
        'authorId', 'isPublic', 'version', 'updatedAt', 'usageCount', 'starshipId'
      ];
      
      const validation = ValidationUtils.hasRequiredFields(agent, requiredFields);
      expect(validation.isValid).toBe(true);
      expect(validation.missingFields).toHaveLength(0);
    });

    it('should validate Agent interface with TypeAssertions', () => {
      const agent = TestDataFactory.createAgent();
      expect(() => TypeAssertions.assertAgent(agent)).not.toThrow();
    });

    it('should validate category enum values', () => {
      const validCategories = ['general', 'coding', 'creative', 'analysis', 'support'];
      
      validCategories.forEach(category => {
        const agent = TestDataFactory.createAgent({ category: category as any });
        expect(() => TypeAssertions.assertAgent(agent)).not.toThrow();
      });
      
      const invalidAgent = TestDataFactory.createAgent({ category: 'invalid' as any });
      expect(() => TypeAssertions.assertAgent(invalidAgent)).toThrow();
    });

    it('should validate timestamp format', () => {
      const agent = TestDataFactory.createAgent();
      
      expect(ValidationUtils.isValidTimestamp(agent.createdAt)).toBe(true);
      expect(ValidationUtils.isValidTimestamp(agent.updatedAt)).toBe(true);
    });

    it('should validate numeric fields', () => {
      const agent = TestDataFactory.createAgent({
        usageCount: 42,
        rating: 4.5,
        temperature: 0.7,
        maxTokens: 4000
      });
      
      expect(typeof agent.usageCount).toBe('number');
      expect(agent.usageCount).toBeGreaterThanOrEqual(0);
      
      if (agent.rating !== undefined) {
        expect(typeof agent.rating).toBe('number');
        expect(agent.rating).toBeGreaterThanOrEqual(0);
        expect(agent.rating).toBeLessThanOrEqual(5);
      }
      
      if (agent.temperature !== undefined) {
        expect(typeof agent.temperature).toBe('number');
        expect(agent.temperature).toBeGreaterThanOrEqual(0);
        expect(agent.temperature).toBeLessThanOrEqual(2);
      }
    });

    it('should validate array fields', () => {
      const agent = TestDataFactory.createAgent({
        tags: ['test', 'development', 'ai'],
        allowedStarshipClasses: ['scout', 'cruiser'],
        requiredPermissions: ['read', 'write']
      });
      
      expect(Array.isArray(agent.tags)).toBe(true);
      agent.tags.forEach(tag => {
        expect(typeof tag).toBe('string');
        expect(tag.length).toBeGreaterThan(0);
      });
      
      if (agent.allowedStarshipClasses) {
        expect(Array.isArray(agent.allowedStarshipClasses)).toBe(true);
        agent.allowedStarshipClasses.forEach(shipClass => {
          expect(['scout', 'cruiser']).toContain(shipClass);
        });
      }
    });

    it('should be serializable', () => {
      const agent = TestDataFactory.createAgent();
      expect(ValidationUtils.isSerializable(agent)).toBe(true);
    });
  });

  describe('CreateAgentRequest', () => {
    it('should validate required fields for CreateAgentRequest', () => {
      const createRequest = TestDataFactory.createAgentRequest();
      
      const requiredFields = ['name', 'category', 'model', 'starshipId'];
      const validation = ValidationUtils.hasRequiredFields(createRequest, requiredFields);
      
      expect(validation.isValid).toBe(true);
      expect(validation.missingFields).toHaveLength(0);
    });

    it('should handle optional fields correctly', () => {
      const createRequest = TestDataFactory.createAgentRequest({
        description: 'Test description',
        systemPrompt: 'Custom system prompt',
        tags: ['custom', 'test'],
        isPublic: false,
        temperature: 0.5,
        maxTokens: 2048,
        customInstructions: 'Custom instructions',
        allowedStarshipClasses: ['scout'],
        authorId: 'custom-author'
      });
      
      expect(createRequest.description).toBe('Test description');
      expect(createRequest.systemPrompt).toBe('Custom system prompt');
      expect(createRequest.isPublic).toBe(false);
      expect(createRequest.temperature).toBe(0.5);
      expect(createRequest.allowedStarshipClasses).toEqual(['scout']);
    });

    it('should be serializable', () => {
      const createRequest = TestDataFactory.createAgentRequest();
      expect(ValidationUtils.isSerializable(createRequest)).toBe(true);
    });
  });

  describe('MemoryEntry', () => {
    it('should validate MemoryEntry structure', () => {
      const memoryEntry: MemoryEntry = {
        role: 'user',
        content: 'Test message content',
        timestamp: Date.now()
      };
      
      expect(memoryEntry).toHaveProperty('role');
      expect(memoryEntry).toHaveProperty('content');
      expect(['user', 'assistant', 'system']).toContain(memoryEntry.role);
      expect(typeof memoryEntry.content).toBe('string');
      expect(memoryEntry.content.length).toBeGreaterThan(0);
    });

    it('should handle optional timestamp', () => {
      const memoryEntryWithoutTimestamp: MemoryEntry = {
        role: 'assistant',
        content: 'Response content'
      };
      
      expect(memoryEntryWithoutTimestamp.timestamp).toBeUndefined();
      expect(ValidationUtils.isSerializable(memoryEntryWithoutTimestamp)).toBe(true);
    });
  });

  describe('EnhancedMemoryEntry', () => {
    it('should extend MemoryEntry with additional fields', () => {
      const enhancedEntry: EnhancedMemoryEntry = {
        role: 'user',
        content: 'Test content',
        timestamp: Date.now(),
        embedding: [0.1, 0.2, 0.3],
        importance: 0.8,
        summary: 'Brief summary'
      };
      
      // Should have all MemoryEntry fields
      expect(enhancedEntry).toHaveProperty('role');
      expect(enhancedEntry).toHaveProperty('content');
      
      // Should have additional fields
      if (enhancedEntry.embedding) {
        expect(Array.isArray(enhancedEntry.embedding)).toBe(true);
        enhancedEntry.embedding.forEach(value => {
          expect(typeof value).toBe('number');
        });
      }
      
      if (enhancedEntry.importance !== undefined) {
        expect(typeof enhancedEntry.importance).toBe('number');
        expect(enhancedEntry.importance).toBeGreaterThanOrEqual(0);
        expect(enhancedEntry.importance).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('LLMChatPrompt', () => {
    it('should validate LLMChatPrompt structure', () => {
      const prompt: LLMChatPrompt = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, how are you?' },
          { role: 'assistant', content: 'I am doing well, thank you!' }
        ]
      };
      
      expect(prompt).toHaveProperty('messages');
      expect(Array.isArray(prompt.messages)).toBe(true);
      expect(prompt.messages.length).toBeGreaterThan(0);
      
      prompt.messages.forEach(message => {
        expect(message).toHaveProperty('role');
        expect(message).toHaveProperty('content');
        expect(['system', 'assistant', 'user']).toContain(message.role);
        expect(typeof message.content).toBe('string');
      });
    });

    it('should be serializable', () => {
      const prompt: LLMChatPrompt = {
        messages: [
          { role: 'user', content: 'Test message' }
        ]
      };
      
      expect(ValidationUtils.isSerializable(prompt)).toBe(true);
    });
  });

  describe('LLMResult', () => {
    it('should validate LLMResult structure', () => {
      const result: LLMResult = {
        reply: 'Test response',
        usage: TestDataFactory.createUsageStats()
      };
      
      expect(result).toHaveProperty('reply');
      expect(typeof result.reply).toBe('string');
      expect(result.reply.length).toBeGreaterThan(0);
      
      if (result.usage) {
        expect(() => TypeAssertions.assertUsageStats(result.usage)).not.toThrow();
      }
    });
  });
});