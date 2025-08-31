/**
 * Base Memory System
 *
 * Provides core message management for LLM interactions
 * Handles messages in LLM-compatible format
 */

import { v4 as uuidv4 } from 'uuid';

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
 * Base Memory Class
 *
 * Core message management system that stores rich Message objects internally
 * but provides LLM-compatible format for external consumption
 */
export class Memory {
  protected messages: Message[] = [];

  constructor(initialSystemMessage?: string) {
    if (initialSystemMessage) {
      this.addMessage('system', initialSystemMessage);
    }
  }

  /**
   * Add message to memory
   */
  addMessage(role: 'system' | 'user' | 'assistant', content: string, metadata?: Record<string, unknown>): void {
    if (content && content.trim()) {
      const message: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        role,
        content: content.trim(),
        metadata
      };
      this.messages.push(message);
    }
  }

  /**
   * Get all messages
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Get all message entries (alias for getMessages)
   */
  getMessageEntries(): Message[] {
    return this.getMessages();
  }

  /**
   * Format messages for LLM consumption (alias for getMessages)
   */
  toMessages(): Message[] {
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
  getMessagesByRole(role: 'system' | 'user' | 'assistant'): Message[] {
    return this.messages.filter(msg => msg.role === role);
  }

  /**
   * Get last N messages
   */
  getLastMessages(count: number): Message[] {
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