/**
 * Base Memory System
 *
 * Provides core message management for LLM interactions
 * Handles messages in LLM-compatible format
 */

// uuid import removed as it's no longer used in constructor

export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Message entry with metadata
 */
export interface LlmMessage {
  role: MessageRole;
  content: string;
}

/**
 * Memory constructor parameters
 */
export interface MemoryState {
  messages?: LlmMessage[];
}

/**
 * Base Memory Class
 *
 * Core message management system that stores rich Message objects internally
 * but provides LLM-compatible format for external consumption
 */
export class Memory {
  protected state: MemoryState;

  constructor(initialState: MemoryState = {}) {
    this.state = {
      ...initialState,
      messages: initialState?.messages || [],
    };
  }

  /**
   * Add message to memory
   */
  addMessage(message: LlmMessage): void {
    const { content, role } = message;
    if (content && content.trim()) {
      const message: LlmMessage = {
        role,
        content: content.trim(),
      };
      if (Array.isArray(this.state.messages)) {
        this.state.messages.push(message);
      }
    }
  }

  /**
   * Get all messages
   */
  getMessages(): LlmMessage[] {
    return [...(this.state.messages || [])];
  }

  /**
   * Format messages for LLM consumption (alias for getMessages)
   */
  toMessages(): LlmMessage[] {
    return this.getMessages();
  }
}
