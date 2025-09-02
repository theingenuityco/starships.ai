/**
 * AgentMemory Unit Tests
 */

import { AgentMemory, AgentIdentity, AgentPurpose, AgentSpace } from '../AgentMemory';
import { Message } from '../Memory';

describe('AgentMemory', () => {
  let agentMemory: AgentMemory;

  beforeEach(() => {
    agentMemory = new AgentMemory();
  });

  describe('constructor', () => {
    it('should initialize with empty state and messages by default', () => {
      const newAgentMemory = new AgentMemory();
      expect(newAgentMemory.getMessages()).toHaveLength(0);
      expect(newAgentMemory.getIdentity()).toBeUndefined();
      expect(newAgentMemory.getPurpose()).toBeUndefined();
      expect(newAgentMemory.getSpace()).toBeUndefined();
    });

    it('should initialize with provided messages from parent constructor', () => {
      const messages: Message[] = [
        {
          id: 'test-1',
          timestamp: '2023-01-01T00:00:00.000Z',
          role: 'user',
          content: 'Hello'
        }
      ];
      const newAgentMemory = new AgentMemory({ messages });
      expect(newAgentMemory.getMessages()).toHaveLength(1);
      expect(newAgentMemory.getMessages()[0].content).toBe('Hello');
    });

    it('should initialize with provided state containing agent-specific data', () => {
      const identity: AgentIdentity = {
        name: 'TestAgent',
        role: 'Assistant',
        personality: 'Helpful and friendly'
      };
      const newAgentMemory = new AgentMemory({
        state: { identity }
      });
      expect(newAgentMemory.getIdentity()).toEqual(identity);
    });
  });

  describe('setIdentity and getIdentity', () => {
    it('should set and get agent identity', () => {
      const identity: AgentIdentity = {
        name: 'TestBot',
        role: 'Customer Support',
        personality: 'Professional and empathetic',
        expertise: ['customer service', 'troubleshooting']
      };

      agentMemory.setIdentity(identity);
      const retrievedIdentity = agentMemory.getIdentity();
      
      expect(retrievedIdentity).toEqual(identity);
    });

    it('should return a copy of identity to prevent mutation', () => {
      const identity: AgentIdentity = {
        name: 'TestBot',
        expertise: ['skill1', 'skill2']
      };

      agentMemory.setIdentity(identity);
      const retrievedIdentity = agentMemory.getIdentity();
      
      // Modify the retrieved identity
      retrievedIdentity!.name = 'ModifiedBot';
      retrievedIdentity!.expertise!.push('skill3');
      
      // Original should remain unchanged
      expect(agentMemory.getIdentity()!.name).toBe('TestBot');
      expect(agentMemory.getIdentity()!.expertise).toEqual(['skill1', 'skill2']);
    });

    it('should handle partial identity data', () => {
      const partialIdentity: AgentIdentity = {
        name: 'PartialBot'
      };

      agentMemory.setIdentity(partialIdentity);
      const retrievedIdentity = agentMemory.getIdentity();
      
      expect(retrievedIdentity!.name).toBe('PartialBot');
      expect(retrievedIdentity!.role).toBeUndefined();
      expect(retrievedIdentity!.personality).toBeUndefined();
      expect(retrievedIdentity!.expertise).toBeUndefined();
    });

    it('should return undefined when no identity is set', () => {
      expect(agentMemory.getIdentity()).toBeUndefined();
    });

    it('should handle empty expertise array', () => {
      const identity: AgentIdentity = {
        name: 'TestBot',
        expertise: []
      };

      agentMemory.setIdentity(identity);
      expect(agentMemory.getIdentity()!.expertise).toEqual([]);
    });
  });

  describe('setPurpose and getPurpose', () => {
    it('should set and get agent purpose', () => {
      const purpose: AgentPurpose = {
        primary: 'Help users with their questions',
        secondary: ['Provide accurate information', 'Be polite'],
        constraints: ['Do not provide medical advice', 'Stay on topic']
      };

      agentMemory.setPurpose(purpose);
      const retrievedPurpose = agentMemory.getPurpose();
      
      expect(retrievedPurpose).toEqual(purpose);
    });

    it('should return a copy of purpose to prevent mutation', () => {
      const purpose: AgentPurpose = {
        primary: 'Original purpose',
        secondary: ['goal1', 'goal2'],
        constraints: ['constraint1']
      };

      agentMemory.setPurpose(purpose);
      const retrievedPurpose = agentMemory.getPurpose();
      
      // Modify the retrieved purpose
      retrievedPurpose!.primary = 'Modified purpose';
      retrievedPurpose!.secondary!.push('goal3');
      retrievedPurpose!.constraints!.push('constraint2');
      
      // Original should remain unchanged
      expect(agentMemory.getPurpose()!.primary).toBe('Original purpose');
      expect(agentMemory.getPurpose()!.secondary).toEqual(['goal1', 'goal2']);
      expect(agentMemory.getPurpose()!.constraints).toEqual(['constraint1']);
    });

    it('should handle minimal purpose data', () => {
      const minimalPurpose: AgentPurpose = {
        primary: 'Basic assistance'
      };

      agentMemory.setPurpose(minimalPurpose);
      const retrievedPurpose = agentMemory.getPurpose();
      
      expect(retrievedPurpose!.primary).toBe('Basic assistance');
      expect(retrievedPurpose!.secondary).toBeUndefined();
      expect(retrievedPurpose!.constraints).toBeUndefined();
    });

    it('should return undefined when no purpose is set', () => {
      expect(agentMemory.getPurpose()).toBeUndefined();
    });

    it('should handle empty arrays for secondary and constraints', () => {
      const purpose: AgentPurpose = {
        primary: 'Main purpose',
        secondary: [],
        constraints: []
      };

      agentMemory.setPurpose(purpose);
      const retrievedPurpose = agentMemory.getPurpose();
      
      expect(retrievedPurpose!.secondary).toEqual([]);
      expect(retrievedPurpose!.constraints).toEqual([]);
    });
  });

  describe('setSpace and getSpace', () => {
    it('should set and get agent space', () => {
      const space: AgentSpace = {
        description: 'A cozy coffee shop with warm lighting and comfortable seating'
      };

      agentMemory.setSpace(space);
      const retrievedSpace = agentMemory.getSpace();
      
      expect(retrievedSpace).toEqual(space);
    });

    it('should return a copy of space to prevent mutation', () => {
      const space: AgentSpace = {
        description: 'Original space description'
      };

      agentMemory.setSpace(space);
      const retrievedSpace = agentMemory.getSpace();
      
      // Modify the retrieved space
      retrievedSpace!.description = 'Modified space description';
      
      // Original should remain unchanged
      expect(agentMemory.getSpace()!.description).toBe('Original space description');
    });

    it('should return undefined when no space is set', () => {
      expect(agentMemory.getSpace()).toBeUndefined();
    });
  });

  describe('addConversation (deprecated)', () => {
    it('should add messages using legacy method', () => {
      agentMemory.addConversation('user', 'Hello');
      agentMemory.addConversation('assistant', 'Hi there!');
      
      const messages = agentMemory.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('Hi there!');
    });

    it('should support metadata in legacy method', () => {
      const metadata = { source: 'test' };
      agentMemory.addConversation('user', 'Test message', metadata);
      
      const messages = agentMemory.getMessages();
      expect(messages[0].metadata).toEqual(metadata);
    });
  });

  describe('getMessageHistory and getConversationHistory', () => {
    beforeEach(() => {
      agentMemory.addMessage('system', 'System prompt');
      agentMemory.addMessage('user', 'User message');
      agentMemory.addMessage('assistant', 'Assistant response');
    });

    it('should return message history', () => {
      const history = agentMemory.getMessageHistory();
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('System prompt');
      expect(history[1].content).toBe('User message');
      expect(history[2].content).toBe('Assistant response');
    });

    it('should have getConversationHistory as alias for getMessageHistory', () => {
      const messageHistory = agentMemory.getMessageHistory();
      const conversationHistory = agentMemory.getConversationHistory();
      
      expect(conversationHistory).toEqual(messageHistory);
    });
  });

  describe('toMessages', () => {
    it('should return messages without structured context when no agent data is set', () => {
      agentMemory.addMessage('user', 'Hello');
      agentMemory.addMessage('assistant', 'Hi!');
      
      const messages = agentMemory.toMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('Hi!');
    });

    it('should include structured context when agent data is set', () => {
      const identity: AgentIdentity = {
        name: 'TestBot',
        role: 'Assistant'
      };
      const purpose: AgentPurpose = {
        primary: 'Help users'
      };
      const space: AgentSpace = {
        description: 'A helpful environment'
      };

      agentMemory.setIdentity(identity);
      agentMemory.setPurpose(purpose);
      agentMemory.setSpace(space);
      agentMemory.addMessage('user', 'Hello');

      const messages = agentMemory.toMessages();
      
      // Should include system context message plus user message
      expect(messages).toHaveLength(2);
      
      // First message should be system context
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('<identity>');
      expect(messages[0].content).toContain('Name: TestBot');
      expect(messages[0].content).toContain('Role: Assistant');
      expect(messages[0].content).toContain('<purpose>');
      expect(messages[0].content).toContain('Primary Purpose: Help users');
      expect(messages[0].content).toContain('<space>');
      expect(messages[0].content).toContain('A helpful environment');
      
      // Second message should be user message
      expect(messages[1].content).toBe('Hello');
    });

    it('should build context with partial identity data', () => {
      const identity: AgentIdentity = {
        name: 'PartialBot'
      };

      agentMemory.setIdentity(identity);
      agentMemory.addMessage('user', 'Test');

      const messages = agentMemory.toMessages();
      const systemMessage = messages[0];
      
      expect(systemMessage.content).toContain('<identity>');
      expect(systemMessage.content).toContain('Name: PartialBot');
      expect(systemMessage.content).not.toContain('Role:');
      expect(systemMessage.content).not.toContain('Personality:');
      expect(systemMessage.content).not.toContain('Expertise:');
    });

    it('should build context with full identity data', () => {
      const identity: AgentIdentity = {
        name: 'FullBot',
        role: 'Helper',
        personality: 'Friendly',
        expertise: ['skill1', 'skill2']
      };

      agentMemory.setIdentity(identity);
      agentMemory.addMessage('user', 'Test');

      const messages = agentMemory.toMessages();
      const systemMessage = messages[0];
      
      expect(systemMessage.content).toContain('Name: FullBot');
      expect(systemMessage.content).toContain('Role: Helper');
      expect(systemMessage.content).toContain('Personality: Friendly');
      expect(systemMessage.content).toContain('Expertise: skill1, skill2');
    });

    it('should build context with complete purpose data', () => {
      const purpose: AgentPurpose = {
        primary: 'Main goal',
        secondary: ['goal1', 'goal2'],
        constraints: ['constraint1', 'constraint2']
      };

      agentMemory.setPurpose(purpose);
      agentMemory.addMessage('user', 'Test');

      const messages = agentMemory.toMessages();
      const systemMessage = messages[0];
      
      expect(systemMessage.content).toContain('<purpose>');
      expect(systemMessage.content).toContain('Primary Purpose: Main goal');
      expect(systemMessage.content).toContain('Secondary Goals: goal1, goal2');
      expect(systemMessage.content).toContain('Constraints: constraint1, constraint2');
    });

    it('should handle empty arrays in identity and purpose', () => {
      const identity: AgentIdentity = {
        name: 'TestBot',
        expertise: []
      };
      const purpose: AgentPurpose = {
        primary: 'Help',
        secondary: [],
        constraints: []
      };

      agentMemory.setIdentity(identity);
      agentMemory.setPurpose(purpose);
      agentMemory.addMessage('user', 'Test');

      const messages = agentMemory.toMessages();
      const systemMessage = messages[0];
      
      // Empty arrays should not appear in the context
      expect(systemMessage.content).not.toContain('Expertise:');
      expect(systemMessage.content).not.toContain('Secondary Goals:');
      expect(systemMessage.content).not.toContain('Constraints:');
    });

    it('should preserve existing system messages', () => {
      agentMemory.addMessage('system', 'Original system message');
      agentMemory.addMessage('user', 'User message');
      
      const identity: AgentIdentity = { name: 'TestBot' };
      agentMemory.setIdentity(identity);

      const messages = agentMemory.toMessages();
      
      // Should have structured context, user message, and original system message
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toContain('<identity>'); // Structured context
      expect(messages[1].content).toBe('User message'); // Non-system message
      expect(messages[2].content).toBe('Original system message'); // Remaining system message
    });
  });

  describe('clearMessages and clearConversations', () => {
    beforeEach(() => {
      agentMemory.addMessage('system', 'System prompt');
      agentMemory.addMessage('user', 'User message');
      agentMemory.addMessage('assistant', 'Assistant response');
    });

    it('should clear only messages while preserving system messages', () => {
      agentMemory.clearMessages();
      
      const messages = agentMemory.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('System prompt');
    });

    it('should have clearConversations as alias for clearMessages', () => {
      const messageCountBefore = agentMemory.getMessages().length;
      agentMemory.clearConversations();
      const messageCountAfter = agentMemory.getMessages().length;
      
      // Should have same behavior as clearMessages
      expect(messageCountAfter).toBeLessThan(messageCountBefore);
    });

    it('should preserve agent-specific data when clearing messages', () => {
      const identity: AgentIdentity = { name: 'TestBot' };
      agentMemory.setIdentity(identity);
      
      agentMemory.clearMessages();
      
      expect(agentMemory.getIdentity()).toEqual(identity);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      const identity: AgentIdentity = { name: 'TestBot' };
      const purpose: AgentPurpose = { primary: 'Help users' };
      const space: AgentSpace = { description: 'Test space' };
      
      agentMemory.setIdentity(identity);
      agentMemory.setPurpose(purpose);
      agentMemory.setSpace(space);
      agentMemory.addMessage('user', 'Test message');
    });

    it('should clear all data including agent-specific data', () => {
      agentMemory.clear();
      
      expect(agentMemory.getMessages()).toHaveLength(0);
      expect(agentMemory.getIdentity()).toBeUndefined();
      expect(agentMemory.getPurpose()).toBeUndefined();
      expect(agentMemory.getSpace()).toBeUndefined();
    });
  });

  describe('clone', () => {
    beforeEach(() => {
      const identity: AgentIdentity = {
        name: 'TestBot',
        role: 'Assistant',
        expertise: ['skill1', 'skill2']
      };
      const purpose: AgentPurpose = {
        primary: 'Help users',
        secondary: ['goal1'],
        constraints: ['constraint1']
      };
      const space: AgentSpace = {
        description: 'Test environment'
      };
      
      agentMemory.setIdentity(identity);
      agentMemory.setPurpose(purpose);
      agentMemory.setSpace(space);
      agentMemory.addMessage('system', 'System prompt');
      agentMemory.addMessage('user', 'User message');
    });

    it('should create a new AgentMemory instance', () => {
      const cloned = agentMemory.clone();
      expect(cloned).toBeInstanceOf(AgentMemory);
      expect(cloned).not.toBe(agentMemory);
    });

    it('should copy all messages', () => {
      const cloned = agentMemory.clone();
      expect(cloned.getMessages()).toHaveLength(2);
      expect(cloned.getMessages()[0].content).toBe('System prompt');
      expect(cloned.getMessages()[1].content).toBe('User message');
    });

    it('should copy all agent-specific data', () => {
      const cloned = agentMemory.clone();
      
      expect(cloned.getIdentity()).toEqual(agentMemory.getIdentity());
      expect(cloned.getPurpose()).toEqual(agentMemory.getPurpose());
      expect(cloned.getSpace()).toEqual(agentMemory.getSpace());
    });

    it('should create deep copies of all data', () => {
      const cloned = agentMemory.clone();
      
      // Modify original
      agentMemory.getIdentity()!.name = 'Modified';
      agentMemory.getPurpose()!.primary = 'Modified purpose';
      agentMemory.getSpace()!.description = 'Modified space';
      
      // Clone should remain unchanged
      expect(cloned.getIdentity()!.name).toBe('TestBot');
      expect(cloned.getPurpose()!.primary).toBe('Help users');
      expect(cloned.getSpace()!.description).toBe('Test environment');
    });

    it('should maintain independence between original and clone', () => {
      const cloned = agentMemory.clone();
      
      // Add message to original
      agentMemory.addMessage('assistant', 'New message');
      expect(agentMemory.getMessages()).toHaveLength(3);
      expect(cloned.getMessages()).toHaveLength(2);
      
      // Add message to clone
      cloned.addMessage('user', 'Clone message');
      expect(agentMemory.getMessages()).toHaveLength(3);
      expect(cloned.getMessages()).toHaveLength(3);
    });

    it('should handle cloning with no agent-specific data', () => {
      agentMemory.clear();
      agentMemory.addMessage('user', 'Test');
      
      const cloned = agentMemory.clone();
      
      expect(cloned.getIdentity()).toBeUndefined();
      expect(cloned.getPurpose()).toBeUndefined();
      expect(cloned.getSpace()).toBeUndefined();
      expect(cloned.getMessages()).toHaveLength(1);
    });
  });

  describe('getStats and getAgentStats', () => {
    beforeEach(() => {
      const identity: AgentIdentity = { name: 'TestBot' };
      const purpose: AgentPurpose = { primary: 'Help' };
      const space: AgentSpace = { description: 'Test' };
      
      agentMemory.setIdentity(identity);
      agentMemory.setPurpose(purpose);
      agentMemory.setSpace(space);
      
      agentMemory.addMessage('system', 'System 1');
      agentMemory.addMessage('system', 'System 2');
      agentMemory.addMessage('user', 'User 1');
      agentMemory.addMessage('assistant', 'Assistant 1');
      agentMemory.addMessage('user', 'User 2');
    });

    it('should return basic stats compatible with parent class', () => {
      const stats = agentMemory.getStats();
      expect(stats).toEqual({
        total: 5,
        system: 2,
        user: 2,
        assistant: 1
      });
    });

    it('should return comprehensive agent stats', () => {
      const agentStats = agentMemory.getAgentStats();
      
      expect(agentStats).toEqual({
        messages: {
          total: 5,
          system: 2,
          user: 2,
          assistant: 1
        },
        messageEntries: 5,
        hasIdentity: true,
        hasPurpose: true,
        hasSpace: true
      });
    });

    it('should show false flags when agent data is not set', () => {
      agentMemory.clear();
      agentMemory.addMessage('user', 'Test');
      
      const agentStats = agentMemory.getAgentStats();
      
      expect(agentStats).toEqual({
        messages: {
          total: 1,
          system: 0,
          user: 1,
          assistant: 0
        },
        messageEntries: 1,
        hasIdentity: false,
        hasPurpose: false,
        hasSpace: false
      });
    });
  });

  describe('edge cases', () => {
    it('should handle setting agent data multiple times', () => {
      const identity1: AgentIdentity = { name: 'Bot1' };
      const identity2: AgentIdentity = { name: 'Bot2' };
      
      agentMemory.setIdentity(identity1);
      expect(agentMemory.getIdentity()!.name).toBe('Bot1');
      
      agentMemory.setIdentity(identity2);
      expect(agentMemory.getIdentity()!.name).toBe('Bot2');
    });

    it('should handle undefined values in agent data', () => {
      const identity: AgentIdentity = {
        name: 'TestBot',
        role: undefined,
        personality: undefined,
        expertise: undefined
      };
      
      agentMemory.setIdentity(identity);
      const retrieved = agentMemory.getIdentity();
      
      expect(retrieved!.name).toBe('TestBot');
      expect(retrieved!.role).toBeUndefined();
      expect(retrieved!.personality).toBeUndefined();
      expect(retrieved!.expertise).toBeUndefined();
    });

    it('should generate unique IDs for system context messages', () => {
      const identity: AgentIdentity = { name: 'TestBot' };
      agentMemory.setIdentity(identity);
      
      const messages1 = agentMemory.toMessages();
      const messages2 = agentMemory.toMessages();
      
      expect(messages1[0].id).not.toBe(messages2[0].id);
    });

    it('should handle complex nested agent data structures', () => {
      const identity: AgentIdentity = {
        name: 'ComplexBot',
        expertise: ['skill with spaces', 'skill-with-dashes', 'skill_with_underscores']
      };
      const purpose: AgentPurpose = {
        primary: 'Multi-line\npurpose with\nspecial chars: @#$%',
        secondary: ['Goal with, comma', 'Goal with: colon'],
        constraints: ['No &lt;HTML&gt; tags', 'No "quotes"']
      };
      
      agentMemory.setIdentity(identity);
      agentMemory.setPurpose(purpose);
      
      const messages = agentMemory.toMessages();
      const systemContext = messages[0].content;
      
      expect(systemContext).toContain('skill with spaces, skill-with-dashes, skill_with_underscores');
      expect(systemContext).toContain('Multi-line\npurpose with\nspecial chars: @#$%');
      expect(systemContext).toContain('Goal with, comma, Goal with: colon');
    });
  });
});