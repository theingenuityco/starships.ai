/**
 * Serialization and Basic Type Tests for @starships/protocol
 * 
 * Focused tests for core protocol type serialization, validation, and basic functionality.
 */

import * as ProtocolTypes from '../src/index';
import { TestDataFactory, ValidationUtils } from './setup';

describe('Protocol Serialization Tests', () => {
  describe('Core Type Serialization', () => {
    test('UsageStats should be serializable', () => {
      const usageStats = TestDataFactory.createUsageStats({
        prompt_tokens: 100,
        completion_tokens: 50
      });
      
      const serialized = JSON.stringify(usageStats);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized).toEqual(usageStats);
      expect(typeof deserialized.prompt_tokens).toBe('number');
      expect(typeof deserialized.completion_tokens).toBe('number');
    });

    test('ChatRequest should be serializable', () => {
      const chatRequest = TestDataFactory.createChatRequest({
        agent_id: 'test-agent',
        user_id: 'test-user',
        message: 'Hello world',
        stream: true
      });
      
      expect(ValidationUtils.isSerializable(chatRequest)).toBe(true);
      
      const serialized = JSON.stringify(chatRequest);
      const deserialized: ProtocolTypes.ChatRequest = JSON.parse(serialized);
      
      expect(deserialized.agent_id).toBe('test-agent');
      expect(deserialized.user_id).toBe('test-user');
      expect(deserialized.message).toBe('Hello world');
      expect(deserialized.stream).toBe(true);
    });

    test('Agent should be serializable', () => {
      const agent = TestDataFactory.createAgent({
        id: 'test-agent-123',
        name: 'Test Agent',
        category: 'coding'
      });
      
      expect(ValidationUtils.isSerializable(agent)).toBe(true);
      
      const serialized = JSON.stringify(agent);
      const deserialized: ProtocolTypes.Agent = JSON.parse(serialized);
      
      expect(deserialized.id).toBe('test-agent-123');
      expect(deserialized.name).toBe('Test Agent');
      expect(deserialized.category).toBe('coding');
      expect(Array.isArray(deserialized.tags)).toBe(true);
    });
  });

  describe('Field Validation', () => {
    test('UsageStats should have required numeric fields', () => {
      const usageStats = TestDataFactory.createUsageStats();
      
      expect(usageStats).toHaveProperty('prompt_tokens');
      expect(usageStats).toHaveProperty('completion_tokens');
      expect(typeof usageStats.prompt_tokens).toBe('number');
      expect(typeof usageStats.completion_tokens).toBe('number');
      expect(usageStats.prompt_tokens).toBeGreaterThanOrEqual(0);
      expect(usageStats.completion_tokens).toBeGreaterThanOrEqual(0);
    });

    test('ChatRequest should have required string fields', () => {
      const chatRequest = TestDataFactory.createChatRequest();
      
      expect(typeof chatRequest.agent_id).toBe('string');
      expect(typeof chatRequest.user_id).toBe('string');
      expect(typeof chatRequest.message).toBe('string');
      expect(chatRequest.agent_id.length).toBeGreaterThan(0);
      expect(chatRequest.user_id.length).toBeGreaterThan(0);
      expect(chatRequest.message.length).toBeGreaterThan(0);
    });

    test('Agent should have valid enum category', () => {
      const validCategories: ProtocolTypes.Agent['category'][] = ['general', 'coding', 'creative', 'analysis', 'support'];
      
      validCategories.forEach(category => {
        const agent = TestDataFactory.createAgent({ category });
        expect(validCategories).toContain(agent.category);
      });
    });

    test('Agent should have valid timestamp fields', () => {
      const agent = TestDataFactory.createAgent();
      
      expect(ValidationUtils.isValidTimestamp(agent.createdAt)).toBe(true);
      expect(ValidationUtils.isValidTimestamp(agent.updatedAt)).toBe(true);
    });
  });

  describe('Required Fields Validation', () => {
    test('ChatRequest should have all required fields', () => {
      const chatRequest = TestDataFactory.createChatRequest();
      const requiredFields = ['agent_id', 'user_id', 'message'];
      
      const validation = ValidationUtils.hasRequiredFields(chatRequest, requiredFields);
      
      expect(validation.isValid).toBe(true);
      expect(validation.missingFields).toHaveLength(0);
    });

    test('Agent should have all required fields', () => {
      const agent = TestDataFactory.createAgent();
      const requiredFields = [
        'id', 'name', 'model', 'createdAt', 'tags', 'category', 
        'authorId', 'isPublic', 'version', 'updatedAt', 'usageCount', 'starshipId'
      ];
      
      const validation = ValidationUtils.hasRequiredFields(agent, requiredFields);
      
      expect(validation.isValid).toBe(true);
      expect(validation.missingFields).toHaveLength(0);
    });

    test('CreateAgentRequest should have all required fields', () => {
      const createRequest = TestDataFactory.createAgentRequest();
      const requiredFields = ['name', 'category', 'model', 'starshipId'];
      
      const validation = ValidationUtils.hasRequiredFields(createRequest, requiredFields);
      
      expect(validation.isValid).toBe(true);
      expect(validation.missingFields).toHaveLength(0);
    });
  });

  describe('Optional Fields Handling', () => {
    test('ChatRequest should handle optional fields correctly', () => {
      const basicRequest = TestDataFactory.createChatRequest({
        channel_id: undefined,
        stream: undefined
      });
      
      expect(basicRequest.channel_id).toBeUndefined();
      expect(basicRequest.stream).toBeUndefined();
      
      const fullRequest = TestDataFactory.createChatRequest({
        channel_id: 'channel-123',
        stream: true
      });
      
      expect(fullRequest.channel_id).toBe('channel-123');
      expect(fullRequest.stream).toBe(true);
    });

    test('Agent should handle optional fields correctly', () => {
      const basicAgent = TestDataFactory.createAgent({
        systemPrompt: undefined,
        description: undefined,
        rating: undefined,
        temperature: undefined
      });
      
      expect(basicAgent.systemPrompt).toBeUndefined();
      expect(basicAgent.description).toBeUndefined();
      expect(basicAgent.rating).toBeUndefined();
      expect(basicAgent.temperature).toBeUndefined();
      
      const fullAgent = TestDataFactory.createAgent({
        systemPrompt: 'Custom prompt',
        description: 'Custom description',
        rating: 4.5,
        temperature: 0.7
      });
      
      expect(fullAgent.systemPrompt).toBe('Custom prompt');
      expect(fullAgent.description).toBe('Custom description');
      expect(fullAgent.rating).toBe(4.5);
      expect(fullAgent.temperature).toBe(0.7);
    });
  });

  describe('Array Fields Validation', () => {
    test('Agent tags should be string array', () => {
      const agent = TestDataFactory.createAgent({
        tags: ['test', 'development', 'ai']
      });
      
      expect(Array.isArray(agent.tags)).toBe(true);
      expect(agent.tags).toHaveLength(3);
      agent.tags.forEach(tag => {
        expect(typeof tag).toBe('string');
        expect(tag.length).toBeGreaterThan(0);
      });
    });

    test('Agent allowedStarshipClasses should be valid enum array', () => {
      const agent = TestDataFactory.createAgent({
        allowedStarshipClasses: ['scout', 'cruiser']
      });
      
      if (agent.allowedStarshipClasses) {
        expect(Array.isArray(agent.allowedStarshipClasses)).toBe(true);
        agent.allowedStarshipClasses.forEach(shipClass => {
          expect(['scout', 'cruiser']).toContain(shipClass);
        });
      }
    });
  });

  describe('SibilRequest/Response Types', () => {
    test('SibilRequest should be properly structured', () => {
      const sibilRequest = TestDataFactory.createSibilRequest({
        provider: 'anthropic',
        model: 'claude-3-opus',
        message: 'Test Sibil request',
        user_id: 'user-456',
        session_id: 'session-789'
      });
      
      expect(sibilRequest.provider).toBe('anthropic');
      expect(sibilRequest.model).toBe('claude-3-opus');
      expect(sibilRequest.message).toBe('Test Sibil request');
      expect(sibilRequest.user_id).toBe('user-456');
      expect(sibilRequest.session_id).toBe('session-789');
      expect(ValidationUtils.isSerializable(sibilRequest)).toBe(true);
    });

    test('SibilResponse should be properly structured', () => {
      const sibilResponse = TestDataFactory.createSibilResponse({
        content: 'Test Sibil response',
        provider: 'openai',
        model: 'gpt-4',
        usage: TestDataFactory.createUsageStats({
          prompt_tokens: 25,
          completion_tokens: 15
        })
      });
      
      expect(sibilResponse.content).toBe('Test Sibil response');
      expect(sibilResponse.provider).toBe('openai');
      expect(sibilResponse.model).toBe('gpt-4');
      expect(sibilResponse.usage).toBeDefined();
      expect(sibilResponse.usage!.prompt_tokens).toBe(25);
      expect(sibilResponse.usage!.completion_tokens).toBe(15);
      expect(ValidationUtils.isSerializable(sibilResponse)).toBe(true);
    });
  });

  describe('ContentBlock Types', () => {
    test('ContentBlock should handle different types', () => {
      const textBlock = TestDataFactory.createContentBlock({
        type: 'text',
        content: 'Plain text content'
      });
      
      expect(textBlock.type).toBe('text');
      expect(textBlock.content).toBe('Plain text content');
      expect(ValidationUtils.isSerializable(textBlock)).toBe(true);
      
      const codeBlock = TestDataFactory.createContentBlock({
        type: 'code',
        content: 'console.log("Hello world");',
        metadata: {
          language: 'javascript'
        }
      });
      
      expect(codeBlock.type).toBe('code');
      expect(codeBlock.metadata?.language).toBe('javascript');
      expect(ValidationUtils.isSerializable(codeBlock)).toBe(true);
    });
  });
});