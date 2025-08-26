/**
 * LLM Provider Contract Types
 * 
 * Core LLM provider interface definitions for language model communication.
 */

import type { UsageStats } from './chat';

// ============================================================================
// LLM TOOL INTERFACES
// ============================================================================

/**
 * Tool definition for LLM function calling
 */
export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
}

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
    arguments: Record<string, unknown>;
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
      tools?: LLMToolDefinition[];
    }
  ): Promise<LLMResult>;
  
  completeStream(
    prompt: LLMChatPrompt,
    opts?: {
      temperature?: number;
      maxTokens?: number;
      tools?: LLMToolDefinition[];
    }
  ): AsyncGenerator<string, void, unknown>;
}