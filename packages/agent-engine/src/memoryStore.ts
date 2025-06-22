import type { MemoryEntry, SessionKey } from "@starships/protocol";

/**
 * Simple in-memory conversation memory. Not suitable for production, but
 * perfect for testing and as a drop-in until we plug Redis or a vector store.
 */
export class MemoryStore {
  private readonly store = new Map<SessionKey, MemoryEntry[]>();
  /** Maximum messages to retain per session */
  private readonly limit: number;

  constructor(limit = 20) {
    this.limit = limit;
  }

  /** Build a session key from its parts (helper). */
  static makeKey(userId: string, agentId: string, channelOrThreadId: string): SessionKey {
    return `${userId}:${agentId}:${channelOrThreadId}`;
  }

  get(key: SessionKey): MemoryEntry[] {
    return this.store.get(key) ?? [];
  }

  append(key: SessionKey, entry: MemoryEntry): void {
    const existing = this.store.get(key) ?? [];
    const updated = [...existing, entry].slice(-this.limit);
    this.store.set(key, updated);
  }

  /** Remove all history for a conversation. */
  clear(key: SessionKey): void {
    this.store.delete(key);
  }
} 