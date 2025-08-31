/**
 * Agent Memory System
 *
 * Extended memory system for agents with identity, purpose, scene, and conversation history
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
 * Scene/context information (like screenplay background)
 */
export interface Scene {
  setting?: string;
  participants?: string[];
  mood?: string;
  context?: string;
  background?: string;
}

/**
 * Conversation entry with metadata
 */
export interface ConversationEntry {
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
  private scene?: Scene;
  private conversations: ConversationEntry[] = [];

  constructor(initialSystemPrompt?: string) {
    super(); // Don't pass initialSystemPrompt to base - we'll handle it ourselves
    if (initialSystemPrompt) {
      this.addMessage('system', initialSystemPrompt);
    }
  }

  /**
   * Set agent identity
   */
  setIdentity(identity: AgentIdentity): void {
    this.identity = identity;
    this.rebuildSystemContext();
  }

  /**
   * Set agent purpose
   */
  setPurpose(purpose: AgentPurpose): void {
    this.purpose = purpose;
    this.rebuildSystemContext();
  }

  /**
   * Set scene context
   */
  setScene(scene: Scene): void {
    this.scene = scene;
    this.rebuildSystemContext();
  }

  /**
   * Add conversation entry with metadata
   */
  addConversation(
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>
  ): void {
    if (content && content.trim()) {
      const entry: ConversationEntry = {
        id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        role,
        content: content.trim(),
        metadata
      };
      
      this.conversations.push(entry);
      this.addMessage(role, content);
    }
  }

  /**
   * Add system prompt (legacy compatibility)
   */
  addSystemPrompt(prompt: string): void {
    this.addMessage('system', prompt);
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): ConversationEntry[] {
    return [...this.conversations];
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
   * Get scene context
   */
  getScene(): Scene | undefined {
    return this.scene ? { ...this.scene } : undefined;
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
        parts.push(`IDENTITY:\n${identityParts.join('\n')}`);
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
      
      parts.push(`PURPOSE:\n${purposeParts.join('\n')}`);
    }

    // Scene section
    if (this.scene) {
      const sceneParts: string[] = [];
      if (this.scene.setting) sceneParts.push(`Setting: ${this.scene.setting}`);
      if (this.scene.participants && this.scene.participants.length > 0) {
        sceneParts.push(`Participants: ${this.scene.participants.join(', ')}`);
      }
      if (this.scene.mood) sceneParts.push(`Mood: ${this.scene.mood}`);
      if (this.scene.context) sceneParts.push(`Context: ${this.scene.context}`);
      if (this.scene.background) sceneParts.push(`Background: ${this.scene.background}`);
      
      if (sceneParts.length > 0) {
        parts.push(`SCENE:\n${sceneParts.join('\n')}`);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }

  /**
   * Rebuild system context when identity/purpose/scene changes
   */
  private rebuildSystemContext(): void {
    // Remove existing structured system messages and rebuild
    // This is called when identity, purpose, or scene changes
    // For now, we'll just let toMessages() handle the formatting
  }

  /**
   * Clear conversation history only
   */
  clearConversations(): void {
    this.conversations = [];
    // Remove conversation messages but keep system messages
    const systemMessages = this.messages.filter(msg => msg.role === 'system');
    this.messages = systemMessages;
  }

  /**
   * Clear all memory
   */
  clear(): void {
    super.clear();
    this.conversations = [];
    this.identity = undefined;
    this.purpose = undefined;
    this.scene = undefined;
  }

  /**
   * Clone memory instance with all structured data
   */
  clone(): AgentMemory {
    const cloned = new AgentMemory();
    cloned.messages = this.messages.map(msg => ({ ...msg }));
    cloned.conversations = this.conversations.map(conv => ({ ...conv }));
    cloned.identity = this.identity ? { ...this.identity } : undefined;
    cloned.purpose = this.purpose ? { ...this.purpose } : undefined;
    cloned.scene = this.scene ? { ...this.scene } : undefined;
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
    conversations: number;
    hasIdentity: boolean;
    hasPurpose: boolean;
    hasScene: boolean;
  } {
    const messageStats = super.getStats();
    return {
      messages: messageStats,
      conversations: this.conversations.length,
      hasIdentity: !!this.identity,
      hasPurpose: !!this.purpose,
      hasScene: !!this.scene
    };
  }
}

// Export types for external use
export type { LLMMessage } from './Memory';