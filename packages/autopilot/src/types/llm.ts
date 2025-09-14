// uuid import removed as it's no longer used in constructor

export type LLMMessageRole = 'user' | 'assistant' | 'system';

/**
 * Message entry with metadata
 */
export interface LlmMessage {
  role: LLMMessageRole;
  content: string;
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
