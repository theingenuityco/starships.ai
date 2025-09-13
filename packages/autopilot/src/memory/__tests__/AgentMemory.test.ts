/**
 * Agent Memory System Tests
 *
 * Tests for the sophisticated memory system with identity, purpose, space, and conversation history
 */

import { AgentMemory } from '../AgentMemory';
import type { AgentIdentity, AgentPurpose, AgentSpace, AgentMemoryState } from '../AgentMemory';

describe('AgentMemory', () => {
  describe('Initialization', () => {
    it('should create empty agent memory with default state', () => {
      const memory = new AgentMemory();

      expect(memory.state).toEqual({
        messageHistory: [],
      });
      expect(memory.getIdentity()).toBeUndefined();
      expect(memory.getPurpose()).toBeUndefined();
      expect(memory.getSpace()).toBeUndefined();
      expect(memory.getMessageHistory()).toEqual([]);
    });

    it('should create agent memory with initial state', () => {
      const initialState: AgentMemoryState = {
        identity: {
          name: 'Alice',
          role: 'AI Assistant',
          personality: 'Helpful and friendly',
        },
        purpose: {
          primary: 'Assist users with their questions',
        },
        messageHistory: [{ role: 'system', content: 'You are Alice, a helpful AI assistant.' }],
      };

      const memory = new AgentMemory(initialState);

      expect(memory.state).toEqual(initialState);
      expect(memory.getIdentity()).toEqual(initialState.identity);
      expect(memory.getPurpose()).toEqual(initialState.purpose);
      expect(memory.getMessageHistory()).toHaveLength(1);
    });

    it('should handle partial initial state', () => {
      const partialState: AgentMemoryState = {
        identity: { name: 'Bob' },
      };

      const memory = new AgentMemory(partialState);

      expect(memory.state.identity).toEqual({ name: 'Bob' });
      expect(memory.state.messageHistory).toEqual([]);
      expect(memory.getPurpose()).toBeUndefined();
      expect(memory.getSpace()).toBeUndefined();
    });
  });

  describe('Identity Management', () => {
    it('should set and get agent identity', () => {
      const memory = new AgentMemory();
      const identity: AgentIdentity = {
        name: 'Sarah',
        role: 'Customer Support Agent',
        personality: 'Professional and empathetic',
        expertise: ['customer service', 'technical support', 'product knowledge'],
      };

      memory.setIdentity(identity);

      expect(memory.getIdentity()).toEqual(identity);
      expect(memory.state.identity).toEqual(identity);
    });

    it('should update existing identity', () => {
      const memory = new AgentMemory({
        identity: { name: 'OldName', role: 'OldRole' },
      });

      const newIdentity: AgentIdentity = {
        name: 'NewName',
        role: 'NewRole',
        personality: 'Updated personality',
      };

      memory.setIdentity(newIdentity);

      expect(memory.getIdentity()).toEqual(newIdentity);
    });

    it('should handle identity with all optional fields', () => {
      const memory = new AgentMemory();
      const fullIdentity: AgentIdentity = {
        name: 'Expert Agent',
        role: 'Technical Specialist',
        personality: 'Analytical and thorough',
        expertise: ['software development', 'system architecture', 'performance optimization', 'security best practices'],
      };

      memory.setIdentity(fullIdentity);

      const retrievedIdentity = memory.getIdentity();
      expect(retrievedIdentity).toEqual(fullIdentity);
      expect(retrievedIdentity?.expertise).toHaveLength(4);
    });

    it('should return cloned identity to prevent mutation', () => {
      const memory = new AgentMemory();
      const identity: AgentIdentity = {
        name: 'Test Agent',
        expertise: ['skill1', 'skill2'],
      };

      memory.setIdentity(identity);

      const retrieved1 = memory.getIdentity();
      const retrieved2 = memory.getIdentity();

      // Should be different objects
      expect(retrieved1).not.toBe(retrieved2);
      expect(retrieved1).toEqual(retrieved2);

      // Mutating retrieved identity shouldn't affect internal state
      if (retrieved1?.expertise) {
        retrieved1.expertise.push('new skill');
      }

      expect(memory.getIdentity()?.expertise).toEqual(['skill1', 'skill2']);
    });
  });

  describe('Purpose Management', () => {
    it('should set and get agent purpose', () => {
      const memory = new AgentMemory();
      const purpose: AgentPurpose = {
        primary: 'Provide excellent customer service',
        secondary: ['Resolve technical issues', 'Gather customer feedback', 'Escalate complex problems'],
        constraints: ['Always be polite', 'Never promise what cannot be delivered', 'Protect customer privacy'],
      };

      memory.setPurpose(purpose);

      expect(memory.getPurpose()).toEqual(purpose);
      expect(memory.state.purpose).toEqual(purpose);
    });

    it('should handle purpose with only primary goal', () => {
      const memory = new AgentMemory();
      const simplePurpose: AgentPurpose = {
        primary: 'Answer questions accurately',
      };

      memory.setPurpose(simplePurpose);

      const retrieved = memory.getPurpose();
      expect(retrieved?.primary).toBe('Answer questions accurately');
      expect(retrieved?.secondary).toBeUndefined();
      expect(retrieved?.constraints).toBeUndefined();
    });

    it('should update existing purpose', () => {
      const memory = new AgentMemory({
        purpose: {
          primary: 'Old purpose',
          constraints: ['old constraint'],
        },
      });

      const newPurpose: AgentPurpose = {
        primary: 'New purpose',
        secondary: ['new secondary goal'],
        constraints: ['new constraint 1', 'new constraint 2'],
      };

      memory.setPurpose(newPurpose);

      expect(memory.getPurpose()).toEqual(newPurpose);
    });

    it('should return cloned purpose to prevent mutation', () => {
      const memory = new AgentMemory();
      const purpose: AgentPurpose = {
        primary: 'Test purpose',
        secondary: ['goal1', 'goal2'],
        constraints: ['constraint1'],
      };

      memory.setPurpose(purpose);

      const retrieved = memory.getPurpose();
      if (retrieved?.secondary) {
        retrieved.secondary.push('mutated goal');
      }

      expect(memory.getPurpose()?.secondary).toEqual(['goal1', 'goal2']);
    });
  });

  describe('Space Management', () => {
    it('should set and get agent space', () => {
      const memory = new AgentMemory();
      const space: AgentSpace = {
        description: 'A professional customer service environment with access to knowledge bases and escalation procedures',
      };

      memory.setSpace(space);

      expect(memory.getSpace()).toEqual(space);
      expect(memory.state.space).toEqual(space);
    });

    it('should update existing space', () => {
      const memory = new AgentMemory({
        space: { description: 'Old environment' },
      });

      const newSpace: AgentSpace = {
        description: 'Updated environment with new tools and capabilities',
      };

      memory.setSpace(newSpace);

      expect(memory.getSpace()).toEqual(newSpace);
    });

    it('should return cloned space to prevent mutation', () => {
      const memory = new AgentMemory();
      const space: AgentSpace = {
        description: 'Test environment',
      };

      memory.setSpace(space);

      const retrieved = memory.getSpace();
      if (retrieved) {
        retrieved.description = 'Mutated description';
      }

      expect(memory.getSpace()?.description).toBe('Test environment');
    });
  });

  describe('Message History Management', () => {
    it('should add messages to history', () => {
      const memory = new AgentMemory();

      memory.addMessageToHistory({ role: 'system', content: 'System prompt' });
      memory.addMessageToHistory({ role: 'user', content: 'Hello!' });
      memory.addMessageToHistory({ role: 'assistant', content: 'Hi there!' });

      const history = memory.getMessageHistory();
      expect(history).toHaveLength(3);
      expect(history[0]).toEqual({ role: 'system', content: 'System prompt' });
      expect(history[1]).toEqual({ role: 'user', content: 'Hello!' });
      expect(history[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
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
        memory.addMessageToHistory({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content,
        });
      });

      const history = memory.getMessageHistory();
      expect(history).toEqual(messages);
    });

    it('should return cloned message history to prevent mutation', () => {
      const memory = new AgentMemory();
      memory.addMessageToHistory({ role: 'user', content: 'Original message' });

      const history1 = memory.getMessageHistory();
      const history2 = memory.getMessageHistory();

      // Should be different arrays
      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);

      // Mutating returned history shouldn't affect internal state
      history1.push({ role: 'user', content: 'Added message' });

      expect(memory.getMessageHistory()).toHaveLength(1);
    });

    it('should handle empty message history', () => {
      const memory = new AgentMemory();

      expect(memory.getMessageHistory()).toEqual([]);
    });
  });

  describe('System Context Generation', () => {
    it('should generate system context with all components', () => {
      const memory = new AgentMemory();

      memory.setIdentity({
        name: 'Alice',
        role: 'AI Assistant',
        personality: 'Helpful and knowledgeable',
        expertise: ['general knowledge', 'problem solving'],
      });

      memory.setPurpose({
        primary: 'Assist users with their questions',
        secondary: ['Provide accurate information', 'Be engaging'],
        constraints: ['Be honest', 'Stay on topic'],
      });

      memory.setSpace({
        description: 'A helpful AI assistant environment',
      });

      const messages = memory.toMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('Alice');
      expect(messages[0].content).toContain('AI Assistant');
      expect(messages[0].content).toContain('Helpful and knowledgeable');
      expect(messages[0].content).toContain('general knowledge, problem solving');
      expect(messages[0].content).toContain('Assist users with their questions');
      expect(messages[0].content).toContain('Provide accurate information, Be engaging');
      expect(messages[0].content).toContain('Be honest, Stay on topic');
      expect(messages[0].content).toContain('A helpful AI assistant environment');
    });

    it('should generate system context with partial information', () => {
      const memory = new AgentMemory();

      memory.setIdentity({ name: 'Bob' });
      memory.setPurpose({ primary: 'Help users' });

      const messages = memory.toMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('Bob');
      expect(messages[0].content).toContain('Help users');
      expect(messages[0].content).not.toContain('<space>');
    });

    it('should include message history after system context', () => {
      const memory = new AgentMemory();

      memory.setIdentity({ name: 'Charlie' });
      memory.addMessageToHistory({ role: 'user', content: 'Hello Charlie!' });
      memory.addMessageToHistory({ role: 'assistant', content: 'Hello! How can I help?' });

      const messages = memory.toMessages();

      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('Charlie');
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello Charlie!' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'Hello! How can I help?' });
    });

    it('should handle empty state gracefully', () => {
      const memory = new AgentMemory();

      const messages = memory.toMessages();

      expect(messages).toEqual([]);
    });

    it('should format identity section correctly', () => {
      const memory = new AgentMemory();

      memory.setIdentity({
        name: 'Test Agent',
        role: 'Tester',
        personality: 'Thorough',
        expertise: ['testing', 'quality assurance'],
      });

      const messages = memory.toMessages();
      const systemContent = messages[0].content;

      expect(systemContent).toContain('<identity>');
      expect(systemContent).toContain('Name: Test Agent');
      expect(systemContent).toContain('Role: Tester');
      expect(systemContent).toContain('Personality: Thorough');
      expect(systemContent).toContain('Expertise: testing, quality assurance');
      expect(systemContent).toContain('</identity>');
    });

    it('should format purpose section correctly', () => {
      const memory = new AgentMemory();

      memory.setPurpose({
        primary: 'Test software',
        secondary: ['Find bugs', 'Ensure quality'],
        constraints: ['Be thorough', 'Document findings'],
      });

      const messages = memory.toMessages();
      const systemContent = messages[0].content;

      expect(systemContent).toContain('<purpose>');
      expect(systemContent).toContain('Primary Purpose: Test software');
      expect(systemContent).toContain('Secondary Goals: Find bugs, Ensure quality');
      expect(systemContent).toContain('Constraints: Be thorough, Document findings');
      expect(systemContent).toContain('</purpose>');
    });

    it('should format space section correctly', () => {
      const memory = new AgentMemory();

      memory.setSpace({
        description: 'A testing laboratory with various tools and environments',
      });

      const messages = memory.toMessages();
      const systemContent = messages[0].content;

      expect(systemContent).toContain('<space>');
      expect(systemContent).toContain('A testing laboratory with various tools and environments');
      expect(systemContent).toContain('</space>');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle customer service agent scenario', () => {
      const memory = new AgentMemory({
        identity: {
          name: 'Sarah',
          role: 'Customer Support Specialist',
          personality: 'Patient, empathetic, and solution-oriented',
          expertise: ['product knowledge', 'troubleshooting', 'customer relations'],
        },
        purpose: {
          primary: 'Provide exceptional customer support',
          secondary: ['Resolve issues quickly', 'Ensure customer satisfaction', 'Gather feedback for improvements'],
          constraints: ['Always maintain professional tone', 'Protect customer privacy', 'Escalate complex issues to specialists'],
        },
        space: {
          description: 'Customer support center with access to knowledge base, ticketing system, and escalation procedures',
        },
      });

      memory.addMessageToHistory({ role: 'user', content: "I'm having trouble with my order" });
      memory.addMessageToHistory({
        role: 'assistant',
        content: "I'd be happy to help you with your order. Can you provide me with your order number?",
      });

      const messages = memory.toMessages();

      expect(messages).toHaveLength(3); // system + 2 history messages
      expect(messages[0].content).toContain('Sarah');
      expect(messages[0].content).toContain('Customer Support Specialist');
      expect(messages[0].content).toContain('Provide exceptional customer support');
      expect(messages[1].role).toBe('user');
      expect(messages[2].role).toBe('assistant');
    });

    it('should handle technical expert scenario', () => {
      const memory = new AgentMemory({
        identity: {
          name: 'TechBot',
          role: 'Technical Documentation Assistant',
          expertise: ['software architecture', 'API design', 'best practices'],
        },
        purpose: {
          primary: 'Help developers with technical documentation',
          constraints: ['Provide accurate code examples', 'Reference official documentation'],
        },
      });

      const messages = memory.toMessages();

      expect(messages[0].content).toContain('TechBot');
      expect(messages[0].content).toContain('software architecture, API design, best practices');
      expect(messages[0].content).toContain('Provide accurate code examples');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle undefined values gracefully', () => {
      const memory = new AgentMemory();

      // Test with empty/minimal values instead of undefined
      memory.setIdentity({ name: '' });
      memory.setPurpose({ primary: '' });

      const messages = memory.toMessages();
      expect(messages).toHaveLength(1); // Should create system message even with empty values
    });

    it('should handle empty arrays and strings', () => {
      const memory = new AgentMemory();

      memory.setIdentity({
        name: '',
        expertise: [],
      });

      memory.setPurpose({
        primary: '',
        secondary: [],
        constraints: [],
      });

      const messages = memory.toMessages();
      // Should still create system message but with minimal content
      expect(messages).toHaveLength(1);
    });

    it('should maintain state integrity after multiple operations', () => {
      const memory = new AgentMemory();

      // Perform multiple state changes
      memory.setIdentity({ name: 'Agent1' });
      memory.addMessageToHistory({ role: 'user', content: 'Message 1' });
      memory.setPurpose({ primary: 'Purpose 1' });
      memory.addMessageToHistory({ role: 'assistant', content: 'Response 1' });
      memory.setSpace({ description: 'Space 1' });
      memory.setIdentity({ name: 'Agent2', role: 'Updated Role' });

      // Verify final state
      expect(memory.getIdentity()).toEqual({ name: 'Agent2', role: 'Updated Role' });
      expect(memory.getPurpose()).toEqual({ primary: 'Purpose 1' });
      expect(memory.getSpace()).toEqual({ description: 'Space 1' });
      expect(memory.getMessageHistory()).toHaveLength(2);

      const messages = memory.toMessages();
      expect(messages).toHaveLength(3); // system + 2 history messages
    });
  });
});
