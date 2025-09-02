/**
 * Agent Memory System
 *
 * Extended memory system for agents with identity, purpose, space, and conversation history
 * Built on top of the base Memory class for LLM message management
 */

import { Memory, Message, MemoryState, MemoryParams } from './Memory';

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
 * Agent memory state configuration for AgentMemory class
 */
export interface AgentMemoryState extends MemoryState {
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
}

/**
 * Agent memory constructor parameters
 */
export interface AgentMemoryParams extends MemoryParams {
  state?: AgentMemoryState;
}

/**
 * Agent Memory Class
 *
 * Sophisticated memory system for agents with structured context management
 */
export class AgentMemory extends Memory {
  protected state: AgentMemoryState = {};

  constructor(params: AgentMemoryParams = {}) {
    // Call parent constructor first
    super(params);
    
    // Initialize state from params if provided
    if (params.state) {
      this.state = { ...this.state, ...params.state };
    }
  }

  /**
   * Set agent identity
   */
  setIdentity(identity: AgentIdentity): void {
    this.state.identity = identity;
  }

  /**
   * Set agent purpose
   */
  setPurpose(purpose: AgentPurpose): void {
    this.state.purpose = purpose;
  }

  /**
   * Set agent space
   */
  setSpace(space: AgentSpace): void {
    this.state.space = space;
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
   * Get message history
   */
  getMessageHistory(): Message[] {
    return super.getMessageEntries();
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
    if (!this.state.identity) return undefined;
    
    return {
      ...this.state.identity,
      expertise: this.state.identity.expertise ? [...this.state.identity.expertise] : undefined
    };
  }

  /**
   * Get agent purpose
   */
  getPurpose(): AgentPurpose | undefined {
    if (!this.state.purpose) return undefined;
    
    return {
      ...this.state.purpose,
      secondary: this.state.purpose.secondary ? [...this.state.purpose.secondary] : undefined,
      constraints: this.state.purpose.constraints ? [...this.state.purpose.constraints] : undefined
    };
  }

  /**
   * Get agent space
   */
  getSpace(): AgentSpace | undefined {
    return this.state.space ? { ...this.state.space } : undefined;
  }

  /**
   * Format messages for LLM with structured context
   */
  toMessages(): Message[] {
    const messages: Message[] = [];
    const allMessages = super.getMessages();
    
    // Add system messages first
    const systemMessages = allMessages.filter(msg => msg.role === 'system');
    messages.push(...systemMessages);
    
    // Add structured system context if available and no system messages exist
    const systemContext = this.buildSystemContext();
    if (systemContext && systemMessages.length === 0) {
      messages.unshift({
        id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        role: 'system',
        content: systemContext
      });
    }

    // Add all non-system messages
    const nonSystemMessages = allMessages.filter(msg => msg.role !== 'system');
    messages.push(...nonSystemMessages);

    return messages;
  }

  /**
   * Build structured system context
   */
  private buildSystemContext(): string {
    const parts: string[] = [];

    // Identity section
    if (this.state.identity) {
      const identityParts: string[] = [];
      if (this.state.identity.name) identityParts.push(`Name: ${this.state.identity.name}`);
      if (this.state.identity.role) identityParts.push(`Role: ${this.state.identity.role}`);
      if (this.state.identity.personality) identityParts.push(`Personality: ${this.state.identity.personality}`);
      if (this.state.identity.expertise && this.state.identity.expertise.length > 0) {
        identityParts.push(`Expertise: ${this.state.identity.expertise.join(', ')}`);
      }
      
      if (identityParts.length > 0) {
        parts.push(`<identity>\n${identityParts.join('\n')}\n</identity>`);
      }
    }

    // Purpose section
    if (this.state.purpose) {
      const purposeParts: string[] = [];
      purposeParts.push(`Primary Purpose: ${this.state.purpose.primary}`);
      if (this.state.purpose.secondary && this.state.purpose.secondary.length > 0) {
        purposeParts.push(`Secondary Goals: ${this.state.purpose.secondary.join(', ')}`);
      }
      if (this.state.purpose.constraints && this.state.purpose.constraints.length > 0) {
        purposeParts.push(`Constraints: ${this.state.purpose.constraints.join(', ')}`);
      }
      
      parts.push(`<purpose>\n${purposeParts.join('\n')}\n</purpose>`);
    }

    // Space section
    if (this.state.space) {
      parts.push(`<space>\n${this.state.space.description}\n</space>`);
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }


  /**
   * Clear message history only
   */
  clearMessages(): void {
    // Remove conversation messages but keep system messages
    const systemMessages = super.getMessageEntries().filter(msg => msg.role === 'system');
    super.clear();
    systemMessages.forEach(msg => super.addMessage(msg.role, msg.content, msg.metadata));
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
    this.state.identity = undefined;
    this.state.purpose = undefined;
    this.state.space = undefined;
  }

  /**
   * Clone memory instance with all structured data
   */
  clone(): AgentMemory {
    const cloned = new AgentMemory();
    // Copy message entries with metadata
    super.getMessageEntries().forEach(msg =>
      cloned.addMessage(msg.role, msg.content, msg.metadata)
    );
    // Copy agent-specific data
    cloned.state.identity = this.state.identity ? { ...this.state.identity } : undefined;
    cloned.state.purpose = this.state.purpose ? { ...this.state.purpose } : undefined;
    cloned.state.space = this.state.space ? { ...this.state.space } : undefined;
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
      messageEntries: super.getMessageEntries().length,
      hasIdentity: !!this.state.identity,
      hasPurpose: !!this.state.purpose,
      hasSpace: !!this.state.space
    };
  }
}

// Export types for external use
export type { Message, MemoryParams } from './Memory';