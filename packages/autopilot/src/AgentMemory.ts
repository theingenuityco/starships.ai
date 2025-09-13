/**
 * Agent Memory System
 *
 * Extended memory system for agents with identity, purpose, space, and conversation history
 * Built on top of the base Memory class for LLM message management
 */

import { LlmMessage } from '@/Memory';

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
export interface AgentMemoryState {
  identity?: AgentIdentity;
  purpose?: AgentPurpose;
  space?: AgentSpace;
  messageHistory?: LlmMessage[];
}

/**
 * Agent Memory Class
 *
 * Sophisticated memory system for agents with structured context management
 */
export class AgentMemory {
  state: AgentMemoryState;

  constructor(initialState: AgentMemoryState = {}) {
    this.state = {
      ...initialState,
      messageHistory: initialState?.messageHistory || [],
    };
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
   * Get message history
   */
  getMessageHistory(): LlmMessage[] {
    return structuredClone(this.state.messageHistory) || [];
  }

  addMessageToHistory(message: LlmMessage): void {
    this.state.messageHistory?.push(message);
  }

  /**
   * Get agent identity
   */
  getIdentity(): AgentIdentity | undefined {
    return this.state.identity ? { ...this.state.identity } : undefined;
  }

  /**
   * Get agent purpose
   */
  getPurpose(): AgentPurpose | undefined {
    return this.state.purpose ? { ...this.state.purpose } : undefined;
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
  toMessages(): LlmMessage[] {
    const messages: LlmMessage[] = [];

    // Add structured system context if available
    const systemContext = this.buildSystemContext();
    if (systemContext) {
      messages.push({
        role: 'system',
        content: systemContext,
      });
    }

    const messageHistory = this.getMessageHistory();
    messages.push(...messageHistory);

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
}
