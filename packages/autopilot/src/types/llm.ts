// uuid import removed as it's no longer used in constructor

export type LLMMessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Message entry with metadata
 */
export interface LlmFunctionCall {
  name: string;
  arguments: string;
}

export interface LlmToolCall {
  id?: string;
  type?: 'function';
  function: LlmFunctionCall;
}

export interface LlmMessage {
  role: LLMMessageRole;
  content: string;
  tool_calls?: LlmToolCall[];
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    message: LlmMessage;
    finish_reason: string | null;
    index: number;
  }[];
  usage?: LLMUsage;
}
