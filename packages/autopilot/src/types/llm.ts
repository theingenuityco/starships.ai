// uuid import removed as it's no longer used in constructor

export type LLMMessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Message entry with metadata
 */
export interface LlmFunctionCall {
  name: string;
  // Parsed arguments object (parsed from LLM's JSON string response)
  // Always stored as object for consistent JSONB storage
  arguments: unknown;
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

/**
 * Multimodal content types (OpenRouter/OpenAI compatible)
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' } }
  | { type: 'file'; file: { filename: string; file_data: string } }; // OpenRouter PDFs/documents

export type MessageContent = string | ContentBlock[];

/**
 * OpenRouter image generation output.
 *
 * When using OpenRouter image models with `modalities: ['image','text']`,
 * providers may return an `images` array on the assistant message.
 * The URL is typically a data URL: "data:image/png;base64,...".
 */
export type GeneratedImage = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

export interface LlmMessage {
  role: LLMMessageRole;
  content: MessageContent; // Support both string and multimodal content
  // Optional model-provided reasoning/thinking text (for reasoning-capable models)
  reasoning?: string;
  // Optional unified reasoning details (OpenRouter normalized)
  reasoningDetails?: ReasoningDetail[];
  // Optional image generation outputs (OpenRouter extension)
  images?: GeneratedImage[];
  /**
   * The ID of the tool call this message is a result of.
   * For tool role messages emitted after executing a function/tool, providers use this to link
   * the tool result back to the originating assistant toolCall.
   */
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // OpenRouter usage accounting: total amount charged (credits/USD)
  cost: number;
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    message: LlmMessage;
    finishReason: string | null;
    index: number;
  }[];
  usage?: LLMUsage;
}

/**
 * Cache control for OpenRouter prompt caching
 * Used to mark content for caching across requests
 */
export interface CacheControl {
  type: 'ephemeral';
}

/**
 * Base interface for anything that can have cache_control
 */
export interface Cacheable {
  cache_control?: CacheControl;
}

/**
 * OpenRouter extension: System message with cacheable content
 * Extends the standard format to support prompt caching
 */
export interface CacheableSystemMessage {
  role: 'system';
  content: Array<{
    type: 'text';
    text: string;
    cache_control?: CacheControl;
  }>;
}
