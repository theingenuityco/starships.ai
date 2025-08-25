/**
 * LLM Provider Contract Types
 * 
 * Core LLM provider interface definitions for language model communication.
 */

import type { UsageStats } from './chat';

// ============================================================================
// LLM PROVIDER INTERFACES
// ============================================================================

/**
 * LLM chat prompt structure
 */
export interface LLMChatPrompt {
  messages: Array<{ role: 'system' | 'assistant' | 'user'; content: string }>;
}

/**
 * LLM completion result
 */
export interface LLMResult {
  reply: string;
  usage?: UsageStats;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
}

/**
 * LLM provider interface
 */
export interface LLMProvider {
  complete(
    prompt: LLMChatPrompt,
    opts?: {
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
      tools?: any[];
    }
  ): Promise<LLMResult>;
  
  completeStream(
    prompt: LLMChatPrompt,
    opts?: {
      temperature?: number;
      maxTokens?: number;
      tools?: any[];
    }
  ): AsyncGenerator<string, void, unknown>;
}