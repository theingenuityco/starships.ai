// TODO: Shared types will be defined here.

// Shared type definitions for the Discord ↔ Open WebUI bridge layer

/**
 * A single "persona" or agent definition as returned from the registry service.
 * Each agent gets its own Discord bot client.
 */
export interface AgentConfig {
  /** Unique key used internally and by Open WebUI */
  id: string;
  /** Display name that should match the Discord bot username */
  name: string;
  /** Model identifier understood by Open WebUI (e.g. "gpt-4o", "llama-3") */
  model: string;
  /** Discord bot token for this persona */
  botToken: string;
  /** Optional system prompt / persona description */
  systemPrompt?: string;
}

/**
 * Memory entry used to persist a short conversational context between a user and an agent.
 */
export interface MemoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
  /** Epoch millis for when the message was seen */
  timestamp?: number;
}

/** Composite session key (user + agent + channel/thread). */
export type SessionKey = string;

/**
 * Payload accepted by the autonomous dispatch HTTP route.
 */
export interface DispatchPayload {
  agent_id: string;
  channel_id: string;
  /** Raw text message to send */
  message: string;
}

/**
 * Minimal response from Open WebUI chat/completions endpoint.
 */
export interface OpenWebUIChatResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

/** Result of passing a Discord message through the router. */
export interface RouterResult {
  /** The content that was ultimately sent back to Discord. */
  reply: string;
}

// Re-export utility types under a single barrel file
export type { AgentConfig as PersonaConfig }; 