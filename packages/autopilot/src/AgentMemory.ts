/**
 * Agent Memory System
 *
 * Extended memory system for agents with identity, purpose, space, and conversation history
 * Built on top of the base Memory class for LLM message management
 */

import { Memory, LLMMessage } from './Memory';

/**
 * Agent identity information
 */
export interface AgentIdentity {
  name?: string;
  role?: string;
  personality?: string;
  expertise?: string[];
}

/**
 * Agent purpose and goals
 */
export interface AgentPurpose {
  primary: string;
  secondary?: string[];
  constraints?: string[];
}

/**
 * Agent space information (like screenplay background)
 */
export interface AgentSpace {
  description: string;
}

/**
 * Agent memory configuration for autopilot
 */
export interface AgentMemoryConfig {
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
  messages?: Message[];
}

/**
 * Message entry with metadata
 */
export interface Message {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent Memory Class
 * 
 * Sophisticated memory system for agents with structured context management
 */
export class AgentMemory extends Memory {
  private identity?: AgentIdentity;
  private purpose?: AgentPurpose;
  private space?: AgentSpace;
  private messageEntries: Message[] = [];

  constructor(initialSystemPrompt?: string, config?: AgentMemoryConfig) {
    super(); // Don't pass initialSystemPrompt to base - we'll handle it ourselves
    
    // Initialize from config if provided
    if (config) {
      if (config.identity) this.setIdentity(config.identity);
      if (config.purpose) this.setPurpose(config.purpose);
      if (config.space) this.setSpace(config.space);
      if (config.messages) {
        config.messages.forEach(msgEntry => {
          this.addMessage(msgEntry.role, msgEntry.content, msgEntry.metadata);
        });
      }
    }
    
    // Handle legacy initialSystemPrompt (for backward compatibility)
    if (initialSystemPrompt) {
      this.addMessage('system', initialSystemPrompt);
    }
  }

  /**
   * Set agent identity
   */
  setIdentity(identity: AgentIdentity): void {
    this.identity = identity;
  }

  /**
   * Set agent purpose
   */
  setPurpose(purpose: AgentPurpose): void {
    this.purpose = purpose;
  }

  /**
   * Set agent space
   */
  setSpace(space: AgentSpace): void {
    this.space = space;
  }

  /**
   * Add message entry with metadata
   */
  addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    if (content && content.trim()) {
      const entry: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        role,
        content: content.trim(),
        metadata
      };
      
      this.messageEntries.push(entry);
      super.addMessage(role, content);
    }
  }

  /**
   * Add conversation entry with metadata (legacy compatibility)
   * @deprecated Use addMessage instead
   */
  addConversation(
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    this.addMessage(role, content, metadata);
  }

  /**
   * Add system prompt (legacy compatibility)
   */
  addSystemPrompt(prompt: string): void {
    super.addMessage('system', prompt);
  }

  /**
   * Get message history
   */
  getMessageHistory(): Message[] {
    return [...this.messageEntries];
  }

  /**
   * Get conversation history (legacy compatibility)
   * @deprecated Use getMessageHistory instead
   */
  getConversationHistory(): Message[] {
    return this.getMessageHistory();
  }

  /**
   * Get agent identity
   */
  getIdentity(): AgentIdentity | undefined {
    return this.identity ? { ...this.identity } : undefined;
  }

  /**
   * Get agent purpose
   */
  getPurpose(): AgentPurpose | undefined {
    return this.purpose ? { ...this.purpose } : undefined;
  }

  /**
   * Get agent space
   */
  getSpace(): AgentSpace | undefined {
    return this.space ? { ...this.space } : undefined;
  }

  /**
   * Format messages for LLM with structured context
   */
  toMessages(): LLMMessage[] {
    const messages: LLMMessage[] = [];
    
    // Add structured system context if available
    const systemContext = this.buildSystemContext();
    if (systemContext) {
      messages.push({
        role: 'system',
        content: systemContext
      });
    }

    // Add all other messages (excluding system messages we'll replace)
    const nonSystemMessages = this.messages.filter(msg => msg.role !== 'system');
    messages.push(...nonSystemMessages);

    // Add any remaining system messages that aren't part of structured context
    const remainingSystemMessages = this.messages.filter(msg => msg.role === 'system');
    messages.push(...remainingSystemMessages);

    return messages;
  }

  /**
   * Build structured system context
   */
  private buildSystemContext(): string {
    const parts: string[] = [];

    // Identity section
    if (this.identity) {
      const identityParts: string[] = [];
      if (this.identity.name) identityParts.push(`Name: ${this.identity.name}`);
      if (this.identity.role) identityParts.push(`Role: ${this.identity.role}`);
      if (this.identity.personality) identityParts.push(`Personality: ${this.identity.personality}`);
      if (this.identity.expertise && this.identity.expertise.length > 0) {
        identityParts.push(`Expertise: ${this.identity.expertise.join(', ')}`);
      }
      
      if (identityParts.length > 0) {
        parts.push(`<identity>\n${identityParts.join('\n')}\n</identity>`);
      }
    }

    // Purpose section
    if (this.purpose) {
      const purposeParts: string[] = [];
      purposeParts.push(`Primary Purpose: ${this.purpose.primary}`);
      if (this.purpose.secondary && this.purpose.secondary.length > 0) {
        purposeParts.push(`Secondary Goals: ${this.purpose.secondary.join(', ')}`);
      }
      if (this.purpose.constraints && this.purpose.constraints.length > 0) {
        purposeParts.push(`Constraints: ${this.purpose.constraints.join(', ')}`);
      }
      
      parts.push(`<purpose>\n${purposeParts.join('\n')}\n</purpose>`);
    }

    // Space section
    if (this.space) {
      parts.push(`<space>\n${this.space.description}\n</space>`);
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }


  /**
   * Clear message history only
   */
  clearMessages(): void {
    this.messageEntries = [];
    // Remove conversation messages but keep system messages
    const systemMessages = super.getMessages().filter(msg => msg.role === 'system');
    super.clear();
    systemMessages.forEach(msg => super.addMessage(msg.role, msg.content));
  }

  /**
   * Clear conversation history only (legacy compatibility)
   * @deprecated Use clearMessages instead
   */
  clearConversations(): void {
    this.clearMessages();
  }

  /**
   * Clear all memory
   */
  clear(): void {
    super.clear();
    this.messageEntries = [];
    this.identity = undefined;
    this.purpose = undefined;
    this.space = undefined;
  }

  /**
   * Clone memory instance with all structured data
   */
  clone(): AgentMemory {
    const cloned = new AgentMemory();
    // Copy base messages
    super.getMessages().forEach(msg => cloned.addMessage(msg.role, msg.content));
    // Copy message entries
    cloned.messageEntries = this.messageEntries.map(msg => ({ ...msg }));
    // Copy agent-specific data
    cloned.identity = this.identity ? { ...this.identity } : undefined;
    cloned.purpose = this.purpose ? { ...this.purpose } : undefined;
    cloned.space = this.space ? { ...this.space } : undefined;
    return cloned;
  }

  /**
   * Get basic memory statistics (compatible with base class)
   */
  getStats(): { total: number; system: number; user: number; assistant: number } {
    return super.getStats();
  }

  /**
   * Get comprehensive agent memory statistics
   */
  getAgentStats(): {
    messages: { total: number; system: number; user: number; assistant: number };
    messageEntries: number;
    hasIdentity: boolean;
    hasPurpose: boolean;
    hasSpace: boolean;
  } {
    const messageStats = super.getStats();
    return {
      messages: messageStats,
      messageEntries: this.messageEntries.length,
      hasIdentity: !!this.identity,
      hasPurpose: !!this.purpose,
      hasSpace: !!this.space
    };
  }
}

// Export types for external use
export type { LLMMessage } from './Memory';