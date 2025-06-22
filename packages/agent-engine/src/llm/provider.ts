import type { UsageStats } from "@starships/protocol";

export interface LLMChatPrompt {
  /** Array of messages composing the prompt in chat format */
  messages: Array<{ role: "system" | "assistant" | "user"; content: string }>;
}

export interface LLMResult {
  reply: string;
  usage?: UsageStats;
}

export interface LLMProvider {
  /**
   * Generate a completion for the given prompt.
   * If `opts.stream` is true, implementors may return partials through an async iterator.
   */
  complete(prompt: LLMChatPrompt, opts?: { stream?: boolean }): Promise<LLMResult>;
} 