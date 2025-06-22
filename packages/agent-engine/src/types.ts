export interface MemoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

/** Composite session key (user + agent + channel/thread). */
export type SessionKey = string; 