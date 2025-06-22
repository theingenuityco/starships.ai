export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ChatRequest {
  agent_id: string;
  user_id: string;
  channel_id?: string;
  message: string;
  stream?: boolean;
}

export interface ChatResponse {
  reply: string;
  usage?: UsageStats;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  systemPrompt?: string;
}

export interface MemoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export type SessionKey = string;

export interface LLMChatPrompt {
  messages: Array<{ role: "system" | "assistant" | "user"; content: string }>;
}

export interface LLMResult {
  reply: string;
  usage?: UsageStats;
}

export interface LLMProvider {
  complete(prompt: LLMChatPrompt, opts?: { stream?: boolean }): Promise<LLMResult>;
} 