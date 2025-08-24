// Jest globals are available during tests, we can use the global `jest` without importing
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line no-undef

import type { ChatRequest, ChatResponse, MemoryEntry, MemorySearchResult } from "@starships/protocol";

/**
 * Mock in-memory store for testing
 */
class MockLangChainMemoryStore {
  private readonly store = new Map<string, MemoryEntry[]>();
  
  makeKey(agentId: string, userId: string): string {
    return `${agentId}:${userId}`;
  }
  
  async get(key: string): Promise<MemoryEntry[]> {
    return this.store.get(key) ?? [];
  }
  
  async append(key: string, entry: MemoryEntry): Promise<void> {
    const current = await this.get(key);
    this.store.set(key, [...current, entry]);
  }
  
  async clear(key: string): Promise<void> {
    this.store.delete(key);
  }
  
  async semanticSearch(sessionKey: string, query: string, limit: number = 5): Promise<MemorySearchResult> {
    const entries = await this.get(sessionKey);
    // Simple mock: return entries that contain query text
    const filteredEntries = entries
      .filter(entry => entry.content.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map(entry => ({
        ...entry,
        importance: 0.8,
      }));
    
    return {
      entries: filteredEntries,
      relevanceScores: filteredEntries.map(() => 0.8),
    };
  }
  
  async saveIndex(): Promise<void> {
    // Mock implementation - no-op
  }
}

const chat = jest.fn(async (req: ChatRequest, _store: MockLangChainMemoryStore): Promise<ChatResponse> => {
  return {
    reply: `echo:${req.message}`,
  } as ChatResponse;
});

// PersonaRegistry removed - agents are now managed via Neo4j

export const LangChainMemoryStore = MockLangChainMemoryStore as unknown as typeof import("@starships/agent-engine").LangChainMemoryStore;
export { chat }; 