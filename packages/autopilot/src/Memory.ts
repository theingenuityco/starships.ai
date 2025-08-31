/**
 * Base Memory System
 *
 * Provides core message management for LLM interactions
 * Handles messages in LLM-compatible format
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * LLM-compatible message format
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Base Memory Class
 * 
 * Core message management system that handles LLM-compatible messages
 */
export class Memory {
  protected messages: LLMMessage[] = [];

  constructor(initialSystemMessage?: string) {
    if (initialSystemMessage) {
      this.addMessage('system', initialSystemMessage);
    }
  }

  /**
   * Add message to memory
   */
  addMessage(role: 'system' | 'user' | 'assistant', content: string): void {
    if (content && content.trim()) {
      this.messages.push({
        role,
        content: content.trim()
      });
    }
  }

  /**
   * Get all messages in LLM format
   */
  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  /**
   * Format messages for LLM consumption (alias for getMessages)
   */
  toMessages(): LLMMessage[] {
    return this.getMessages();
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Get messages by role
   */
  getMessagesByRole(role: 'system' | 'user' | 'assistant'): LLMMessage[] {
    return this.messages.filter(msg => msg.role === role);
  }

  /**
   * Get last N messages
   */
  getLastMessages(count: number): LLMMessage[] {
    return this.messages.slice(-count);
  }

  /**
   * Clone memory instance
   */
  clone(): Memory {
    const cloned = new Memory();
    cloned.messages = this.messages.map(msg => ({ ...msg }));
    return cloned;
  }

  /**
   * Get memory statistics
   */
  getStats(): { total: number; system: number; user: number; assistant: number } {
    const stats = { total: 0, system: 0, user: 0, assistant: 0 };
    this.messages.forEach(msg => {
      stats.total++;
      stats[msg.role]++;
    });
    return stats;
  }
}