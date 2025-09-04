/**
 * Memory store for agent sessions and conversation state
 * Simple in-memory implementation for development
 */

export interface MemoryStore {
  makeKey(agentId: string, userId: string): string;
  clear(key: string): Promise<void>;
  get(key: string): any;
  set(key: string, value: any): void;
  has(key: string): boolean;
  delete(key: string): boolean;
}

class InMemoryStore implements MemoryStore {
  private store = new Map<string, any>();

  makeKey(agentId: string, userId: string): string {
    return `agent:${agentId}:user:${userId}`;
  }

  async clear(key: string): Promise<void> {
    this.store.delete(key);
  }

  get(key: string): any {
    return this.store.get(key);
  }

  set(key: string, value: any): void {
    this.store.set(key, value);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }
}

const memoryStore = new InMemoryStore();

export default function getStore(): MemoryStore {
  return memoryStore;
}
