/**
 * Agent Memory System
 *
 * Minimal memory system - just system prompt and messages
 */

import { LlmMessage } from '@/types';

/**
 * Minimal agent memory state
 */
export interface AgentMemoryState {
  systemPrompt?: string; // System prompt
  messages?: LlmMessage[]; // Message history
}

/**
 * Agent Memory Class
 *
 * Minimal memory system with just system prompt and messages
 */
export class AgentMemory {
  state: AgentMemoryState;

  constructor(initialState: AgentMemoryState = {}) {
    this.state = {
      systemPrompt: initialState.systemPrompt,
      messages: initialState.messages || [],
    };
  }

  /**
   * Set system prompt
   */
  setSystemPrompt(systemPrompt: string): void {
    this.state.systemPrompt = systemPrompt;
  }

  /**
   * Add message to history
   */
  addMessage(message: LlmMessage): void {
    if (!this.state.messages) {
      this.state.messages = [];
    }
    this.state.messages.push(message);
  }

  /**
   * Format messages for LLM
   */
  toMessages(): LlmMessage[] {
    const messages: LlmMessage[] = [];

    // Add system prompt if available
    if (this.state.systemPrompt) {
      messages.push({
        role: 'system',
        content: this.state.systemPrompt,
      });
    }

    // Add message history
    if (this.state.messages) {
      messages.push(...this.state.messages);
    }

    return messages;
  }
}

// Legacy exports for backward compatibility (will be removed)
export interface AgentIdentity {
  name?: string;
  role?: string;
  personality?: string;
  expertise?: string[];
}

export interface AgentPurpose {
  primary: string;
  secondary?: string[];
  constraints?: string[];
}

export interface AgentSpace {
  description: string;
}
