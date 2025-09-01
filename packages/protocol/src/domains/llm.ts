/**
 * LLM Domain Types
 *
 * Core LLM provider interfaces and chat prompt types.
 */

// ============================================================================
// LLM TOOL DEFINITION
// ============================================================================

/**
 * LLM tool definition for function calling
 */
export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// ============================================================================
// LLM CHAT PROMPT
// ============================================================================

/**
 * LLM chat prompt structure
 */
export interface LLMChatPrompt {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: LLMToolDefinition[];
}

// ============================================================================
// LLM RESULT TYPES
// ============================================================================

/**
 * LLM completion result
 */
export interface LLMResult {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  finish_reason?: 'stop' | 'length' | 'tool_calls';
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

// ============================================================================
// LLM PROVIDER INTERFACE
// ============================================================================

/**
 * LLM provider interface
 */
export interface LLMProvider {
  complete(prompt: LLMChatPrompt, opts?: {
    stream?: boolean;
    temperature?: number;
    maxTokens?: number;
    tools?: LLMToolDefinition[];
  }): Promise<LLMResult>;
  
  completeStream(prompt: LLMChatPrompt, opts?: {
    temperature?: number;
    maxTokens?: number;
    tools?: LLMToolDefinition[];
  }): AsyncGenerator<string, void, unknown>;
}

// ============================================================================
// LLM MODEL TYPES
// ============================================================================

/**
 * LLM model configuration
 */
export interface LLM {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'huggingface' | 'ollama';
  maxTokens: number;
  temperature: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  costPer1kTokens: number;
  createdAt: string;
}