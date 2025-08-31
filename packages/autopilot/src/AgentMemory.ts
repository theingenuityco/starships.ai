/**
 * Agent Memory System
 *
 * Provides structured memory management for agents with system prompts and conversation history.
 * Formats data for direct consumption by LLM APIs.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Individual conversation entry
 */
export interface ConversationEntry {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * LLM-compatible message format
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Agent Memory Class
 * 
 * Manages system prompts and conversation history with intelligent LLM formatting
 */
export class AgentMemory {
  private systemPrompts: string[] = [];
  private conversations: ConversationEntry[] = [];

  /**
   * Create new agent memory instance
   */
  constructor(initialSystemPrompt?: string) {
    if (initialSystemPrompt) {
      this.systemPrompts.push(initialSystemPrompt);
    }
  }

  /**
   * Add system prompt (accumulative)
   */
  addSystemPrompt(prompt: string): void {
    if (prompt && prompt.trim()) {
      this.systemPrompts.push(prompt.trim());
    }
  }

  /**
   * Add conversation entry
   */
  addConversation(
    role: 'user' | 'assistant', 
    content: string, 
    metadata?: Record<string, unknown>
  ): void {
    if (content && content.trim()) {
      this.conversations.push({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        role,
        content: content.trim(),
        metadata
      });
    }
  }

  /**
   * Format memory for LLM consumption
   * Returns array of messages ready for LLM APIs
   */
  toMessages(): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // Combine all system prompts into single system message
    if (this.systemPrompts.length > 0) {
      const combinedSystem = this.systemPrompts.join('\n\n');
      messages.push({
        role: 'system',
        content: combinedSystem
      });
    }

    // Add conversation history in chronological order
    this.conversations.forEach(conv => {
      messages.push({
        role: conv.role,
        content: conv.content
      });
    });

    return messages;
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.systemPrompts = [];
    this.conversations = [];
  }

  /**
   * Clear only conversation history, keep system prompts
   */
  clearConversations(): void {
    this.conversations = [];
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): ConversationEntry[] {
    return [...this.conversations];
  }

  /**
   * Get system prompts
   */
  getSystemPrompts(): string[] {
    return [...this.systemPrompts];
  }

  /**
   * Get memory statistics
   */
  getStats(): { systemPrompts: number; conversations: number } {
    return {
      systemPrompts: this.systemPrompts.length,
      conversations: this.conversations.length
    };
  }

  /**
   * Clone memory instance
   */
  clone(): AgentMemory {
    const cloned = new AgentMemory();
    cloned.systemPrompts = [...this.systemPrompts];
    cloned.conversations = this.conversations.map(conv => ({ ...conv }));
    return cloned;
  }
}