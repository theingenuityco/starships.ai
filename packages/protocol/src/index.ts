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