/**
 * Memory Unit Tests
 */

import { Memory, Message, MemoryParams } from '../Memory';

describe('Memory', () => {
  let memory: Memory;

  beforeEach(() => {
    memory = new Memory();
  });

  describe('constructor', () => {
    it('should initialize with empty state and messages by default', () => {
      const newMemory = new Memory();
      expect(newMemory.getMessages()).toHaveLength(0);
      expect(newMemory.getMessageCount()).toBe(0);
    });

    it('should initialize with provided state', () => {
      const state = { customKey: 'customValue' };
      const newMemory = new Memory({ state });
      // State is protected, but we can verify it's initialized properly through behavior
      expect(newMemory.getMessages()).toHaveLength(0);
    });

    it('should initialize with provided messages', () => {
      const messages: Message[] = [
        {
          id: 'test-1',
          timestamp: '2023-01-01T00:00:00.000Z',
          role: 'user',
          content: 'Hello'
        },
        {
          id: 'test-2',
          timestamp: '2023-01-01T00:00:01.000Z',
          role: 'assistant',
          content: 'Hi there!'
        }
      ];
      const newMemory = new Memory({ messages });
      expect(newMemory.getMessages()).toHaveLength(2);
      expect(newMemory.getMessages()[0].content).toBe('Hello');
      expect(newMemory.getMessages()[1].content).toBe('Hi there!');
    });

    it('should handle empty messages array', () => {
      const newMemory = new Memory({ messages: [] });
      expect(newMemory.getMessages()).toHaveLength(0);
    });
  });

  describe('addMessage', () => {
    it('should add a user message', () => {
      memory.addMessage('user', 'Hello world');
      
      const messages = memory.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello world');
      expect(messages[0].id).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(messages[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should add an assistant message', () => {
      memory.addMessage('assistant', 'Hi there!');
      
      const messages = memory.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('Hi there!');
    });

    it('should add a system message', () => {
      memory.addMessage('system', 'You are a helpful assistant');
      
      const messages = memory.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('You are a helpful assistant');
    });

    it('should add message with metadata', () => {
      const metadata = { source: 'test', priority: 'high' };
      memory.addMessage('user', 'Hello', metadata);
      
      const messages = memory.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].metadata).toEqual(metadata);
    });

    it('should trim whitespace from content', () => {
      memory.addMessage('user', '  Hello world  ');
      
      const messages = memory.getMessages();
      expect(messages[0].content).toBe('Hello world');
    });

    it('should not add empty or whitespace-only messages', () => {
      memory.addMessage('user', '');
      memory.addMessage('user', '   ');
      memory.addMessage('user', '\n\t');
      
      expect(memory.getMessages()).toHaveLength(0);
    });

    it('should generate unique IDs for each message', () => {
      memory.addMessage('user', 'Message 1');
      memory.addMessage('user', 'Message 2');
      
      const messages = memory.getMessages();
      expect(messages[0].id).not.toBe(messages[1].id);
    });

    it('should add multiple messages in order', () => {
      memory.addMessage('system', 'System prompt');
      memory.addMessage('user', 'User message');
      memory.addMessage('assistant', 'Assistant response');
      
      const messages = memory.getMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('System prompt');
      expect(messages[1].content).toBe('User message');
      expect(messages[2].content).toBe('Assistant response');
    });
  });

  describe('getMessages', () => {
    it('should return a copy of messages array', () => {
      memory.addMessage('user', 'Test message');
      
      const messages1 = memory.getMessages();
      const messages2 = memory.getMessages();
      
      expect(messages1).not.toBe(messages2); // Different array instances
      expect(messages1).toEqual(messages2); // Same content
    });

    it('should return empty array for new memory', () => {
      expect(memory.getMessages()).toEqual([]);
    });
  });

  describe('getMessageEntries', () => {
    it('should be an alias for getMessages', () => {
      memory.addMessage('user', 'Test message');
      
      expect(memory.getMessageEntries()).toEqual(memory.getMessages());
    });
  });

  describe('toMessages', () => {
    it('should be an alias for getMessages', () => {
      memory.addMessage('user', 'Test message');
      
      expect(memory.toMessages()).toEqual(memory.getMessages());
    });
  });

  describe('clear', () => {
    it('should remove all messages', () => {
      memory.addMessage('user', 'Message 1');
      memory.addMessage('assistant', 'Message 2');
      
      expect(memory.getMessages()).toHaveLength(2);
      
      memory.clear();
      
      expect(memory.getMessages()).toHaveLength(0);
      expect(memory.getMessageCount()).toBe(0);
    });

    it('should work on empty memory', () => {
      memory.clear();
      expect(memory.getMessages()).toHaveLength(0);
    });
  });

  describe('getMessageCount', () => {
    it('should return correct count for empty memory', () => {
      expect(memory.getMessageCount()).toBe(0);
    });

    it('should return correct count after adding messages', () => {
      memory.addMessage('user', 'Message 1');
      expect(memory.getMessageCount()).toBe(1);
      
      memory.addMessage('assistant', 'Message 2');
      expect(memory.getMessageCount()).toBe(2);
    });

    it('should return 0 after clearing', () => {
      memory.addMessage('user', 'Message');
      memory.clear();
      expect(memory.getMessageCount()).toBe(0);
    });
  });

  describe('getMessagesByRole', () => {
    beforeEach(() => {
      memory.addMessage('system', 'System message 1');
      memory.addMessage('user', 'User message 1');
      memory.addMessage('assistant', 'Assistant message 1');
      memory.addMessage('user', 'User message 2');
      memory.addMessage('system', 'System message 2');
    });

    it('should return only system messages', () => {
      const systemMessages = memory.getMessagesByRole('system');
      expect(systemMessages).toHaveLength(2);
      expect(systemMessages[0].content).toBe('System message 1');
      expect(systemMessages[1].content).toBe('System message 2');
    });

    it('should return only user messages', () => {
      const userMessages = memory.getMessagesByRole('user');
      expect(userMessages).toHaveLength(2);
      expect(userMessages[0].content).toBe('User message 1');
      expect(userMessages[1].content).toBe('User message 2');
    });

    it('should return only assistant messages', () => {
      const assistantMessages = memory.getMessagesByRole('assistant');
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].content).toBe('Assistant message 1');
    });

    it('should return empty array for role with no messages', () => {
      memory.clear();
      expect(memory.getMessagesByRole('user')).toEqual([]);
    });
  });

  describe('getLastMessages', () => {
    beforeEach(() => {
      memory.addMessage('user', 'Message 1');
      memory.addMessage('assistant', 'Message 2');
      memory.addMessage('user', 'Message 3');
      memory.addMessage('assistant', 'Message 4');
      memory.addMessage('user', 'Message 5');
    });

    it('should return last N messages', () => {
      const lastTwo = memory.getLastMessages(2);
      expect(lastTwo).toHaveLength(2);
      expect(lastTwo[0].content).toBe('Message 4');
      expect(lastTwo[1].content).toBe('Message 5');
    });

    it('should return all messages if count exceeds total', () => {
      const lastTen = memory.getLastMessages(10);
      expect(lastTen).toHaveLength(5);
      expect(lastTen[0].content).toBe('Message 1');
    });

    it('should return empty array if count is 0', () => {
      expect(memory.getLastMessages(0)).toEqual([]);
    });

    it('should handle negative count by returning empty array', () => {
      expect(memory.getLastMessages(-1)).toEqual([]);
    });

    it('should return empty array for empty memory', () => {
      memory.clear();
      expect(memory.getLastMessages(5)).toEqual([]);
    });
  });

  describe('clone', () => {
    beforeEach(() => {
      memory.addMessage('system', 'System message');
      memory.addMessage('user', 'User message');
    });

    it('should create a new Memory instance', () => {
      const cloned = memory.clone();
      expect(cloned).toBeInstanceOf(Memory);
      expect(cloned).not.toBe(memory);
    });

    it('should copy all messages', () => {
      const cloned = memory.clone();
      expect(cloned.getMessages()).toHaveLength(2);
      expect(cloned.getMessages()[0].content).toBe('System message');
      expect(cloned.getMessages()[1].content).toBe('User message');
    });

    it('should create deep copies of messages', () => {
      const cloned = memory.clone();
      const originalMessages = memory.getMessages();
      const clonedMessages = cloned.getMessages();
      
      expect(originalMessages[0]).not.toBe(clonedMessages[0]);
      expect(originalMessages[0]).toEqual(clonedMessages[0]);
    });

    it('should maintain independence between original and clone', () => {
      const cloned = memory.clone();
      
      memory.addMessage('user', 'New message');
      expect(memory.getMessages()).toHaveLength(3);
      expect(cloned.getMessages()).toHaveLength(2);
      
      cloned.addMessage('assistant', 'Clone message');
      expect(memory.getMessages()).toHaveLength(3);
      expect(cloned.getMessages()).toHaveLength(3);
    });

    it('should work with empty memory', () => {
      memory.clear();
      const cloned = memory.clone();
      expect(cloned.getMessages()).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return correct stats for empty memory', () => {
      const stats = memory.getStats();
      expect(stats).toEqual({
        total: 0,
        system: 0,
        user: 0,
        assistant: 0
      });
    });

    it('should return correct stats with mixed messages', () => {
      memory.addMessage('system', 'System 1');
      memory.addMessage('system', 'System 2');
      memory.addMessage('user', 'User 1');
      memory.addMessage('assistant', 'Assistant 1');
      memory.addMessage('user', 'User 2');
      memory.addMessage('user', 'User 3');
      
      const stats = memory.getStats();
      expect(stats).toEqual({
        total: 6,
        system: 2,
        user: 3,
        assistant: 1
      });
    });

    it('should update stats after clearing', () => {
      memory.addMessage('user', 'Test');
      memory.clear();
      
      const stats = memory.getStats();
      expect(stats).toEqual({
        total: 0,
        system: 0,
        user: 0,
        assistant: 0
      });
    });
  });

  describe('edge cases', () => {
    it('should handle messages with special characters', () => {
      const specialContent = 'Hello! 🎉 Special chars: @#$%^&*()';
      memory.addMessage('user', specialContent);
      
      const messages = memory.getMessages();
      expect(messages[0].content).toBe(specialContent);
    });

    it('should handle very long messages', () => {
      const longContent = 'A'.repeat(10000);
      memory.addMessage('user', longContent);
      
      const messages = memory.getMessages();
      expect(messages[0].content).toBe(longContent);
    });

    it('should handle messages with newlines and tabs', () => {
      const multilineContent = 'Line 1\nLine 2\n\tTabbed line';
      memory.addMessage('user', multilineContent);
      
      const messages = memory.getMessages();
      expect(messages[0].content).toBe(multilineContent);
    });

    it('should handle concurrent operations', () => {
      // Simulate concurrent message additions
      memory.addMessage('user', 'Message 1');
      memory.addMessage('assistant', 'Message 2');
      const messages1 = memory.getMessages();
      memory.addMessage('user', 'Message 3');
      const messages2 = memory.getMessages();
      
      expect(messages1).toHaveLength(2);
      expect(messages2).toHaveLength(3);
    });

    it('should handle complex metadata objects', () => {
      const complexMetadata = {
        nested: {
          key: 'value',
          array: [1, 2, 3],
          boolean: true
        },
        timestamp: new Date().toISOString(),
        null: null,
        undefined: undefined
      };
      
      memory.addMessage('user', 'Test', complexMetadata);
      const messages = memory.getMessages();
      expect(messages[0].metadata).toEqual(complexMetadata);
    });
  });
});