/**
 * Agent Memory System Tests
 *
 * Tests for the simplified memory system with systemPrompt and messages
 */

import { AgentMemory } from '../AgentMemory';
import type { AgentMemoryState } from '../AgentMemory';

describe('AgentMemory', () => {
  describe('Initialization', () => {
    it('should create empty agent memory with default state', () => {
      const memory = new AgentMemory();

      expect(memory.state).toEqual({
        systemPrompt: undefined,
        messages: [],
      });
    });

    it('should create agent memory with initial state', () => {
      const initialState: AgentMemoryState = {
        systemPrompt: 'You are Alice, a helpful AI assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const memory = new AgentMemory(initialState);

      expect(memory.state).toEqual(initialState);
    });

    it('should handle partial initial state', () => {
      const partialState: AgentMemoryState = {
        systemPrompt: 'You are Bob.',
      };

      const memory = new AgentMemory(partialState);

      expect(memory.state.systemPrompt).toBe('You are Bob.');
      expect(memory.state.messages).toEqual([]);
    });
  });

  describe('System Prompt Management', () => {
    it('should set system prompt', () => {
      const memory = new AgentMemory();

      memory.setSystemPrompt('You are a helpful assistant.');

      expect(memory.state.systemPrompt).toBe('You are a helpful assistant.');
    });

    it('should update existing system prompt', () => {
      const memory = new AgentMemory({
        systemPrompt: 'Old prompt',
      });

      memory.setSystemPrompt('New prompt');

      expect(memory.state.systemPrompt).toBe('New prompt');
    });
  });

  describe('Message Management', () => {
    it('should add messages to history', () => {
      const memory = new AgentMemory();

      memory.addMessage({ role: 'system', content: 'System prompt' });
      memory.addMessage({ role: 'user', content: 'Hello!' });
      memory.addMessage({ role: 'assistant', content: 'Hi there!' });

      expect(memory.state.messages).toHaveLength(3);
      expect(memory.state.messages?.[0]).toEqual({ role: 'system', content: 'System prompt' });
      expect(memory.state.messages?.[1]).toEqual({ role: 'user', content: 'Hello!' });
      expect(memory.state.messages?.[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should preserve message order', () => {
      const memory = new AgentMemory();
      const messages = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'First user message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Follow-up question' },
        { role: 'assistant', content: 'Follow-up response' },
      ];

      messages.forEach((msg) => {
        memory.addMessage({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content,
        });
      });

      expect(memory.state.messages).toEqual(messages);
    });

    it('should handle empty messages array', () => {
      const memory = new AgentMemory();

      expect(memory.state.messages).toEqual([]);
    });
  });

  describe('Message Formatting', () => {
    it('should format messages with system prompt', () => {
      const memory = new AgentMemory({
        systemPrompt: 'You are a helpful assistant.',
        messages: [
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      });

      const messages = memory.toMessages();

      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello!' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should format messages without system prompt', () => {
      const memory = new AgentMemory({
        messages: [
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      });

      const messages = memory.toMessages();

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello!' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should handle empty state', () => {
      const memory = new AgentMemory();

      const messages = memory.toMessages();

      expect(messages).toEqual([]);
    });

    it('should handle only system prompt', () => {
      const memory = new AgentMemory({
        systemPrompt: 'You are helpful.',
      });

      const messages = memory.toMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle customer service scenario', () => {
      const memory = new AgentMemory({
        systemPrompt: 'You are Sarah, a customer support agent. Be helpful and professional.',
        messages: [
          { role: 'user', content: "I'm having trouble with my order" },
          { role: 'assistant', content: "I'd be happy to help you with your order. Can you provide me with your order number?" },
        ],
      });

      const messages = memory.toMessages();

      expect(messages).toHaveLength(3);
      expect(messages[0].content).toContain('Sarah');
      expect(messages[0].content).toContain('customer support');
      expect(messages[1].role).toBe('user');
      expect(messages[2].role).toBe('assistant');
    });

    it('should handle technical assistant scenario', () => {
      const memory = new AgentMemory({
        systemPrompt:
          'You are TechBot, a technical documentation assistant. Provide accurate code examples and reference official documentation.',
      });

      const messages = memory.toMessages();

      expect(messages[0].content).toContain('TechBot');
      expect(messages[0].content).toContain('technical documentation');
      expect(messages[0].content).toContain('code examples');
    });

    it('should handle dynamic updates', () => {
      const memory = new AgentMemory();

      memory.setSystemPrompt('You are a helpful agent.');
      memory.addMessage({ role: 'user', content: 'Hello' });
      memory.addMessage({ role: 'assistant', content: 'Hi!' });
      memory.setSystemPrompt('You are a very helpful agent.');

      const messages = memory.toMessages();

      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('You are a very helpful agent.');
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'Hi!' });
    });
  });
});
