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

// Unified OpenRouter reasoning details
export type ReasoningDetail =
  | {
      type: 'reasoning.summary';
      summary: string;
      id?: string | null;
      format?: 'unknown' | 'openai-responses-v1' | 'anthropic-claude-v1';
      index?: number;
    }
  | {
      type: 'reasoning.encrypted';
      data: string;
      id?: string | null;
      format?: 'unknown' | 'openai-responses-v1' | 'anthropic-claude-v1';
      index?: number;
    }
  | {
      type: 'reasoning.text';
      text: string;
      signature?: string | null;
      id?: string | null;
      format?: 'unknown' | 'openai-responses-v1' | 'anthropic-claude-v1';
      index?: number;
    };

export interface LlmMessage {
  role: LLMMessageRole;
  content: string;
  // Optional model-provided reasoning/thinking text (for reasoning-capable models)
  reasoning?: string;
  // Optional unified reasoning details (OpenRouter normalized)
  reasoning_details?: ReasoningDetail[];
  /**
   * The ID of the tool call this message is a result of.
   * For tool role messages emitted after executing a function/tool, providers use this to link
   * the tool result back to the originating assistant tool_call.
   */
  tool_call_id?: string;
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
