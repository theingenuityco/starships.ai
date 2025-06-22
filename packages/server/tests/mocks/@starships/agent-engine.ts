// Jest globals are available during tests, we can use the global `jest` without importing
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line no-undef

import type { ChatRequest, ChatResponse } from "@starships/protocol";

// Simple in-memory store implementation to satisfy interface
class MockMemoryStore {
  private readonly store = new Map<string, any[]>();
  static makeKey(userId: string, agentId: string, channelId: string): string {
    return `${userId}:${agentId}:${channelId}`;
  }
  get(key: string) {
    return this.store.get(key) ?? [];
  }
  append(key: string, entry: any) {
    const current = this.get(key);
    this.store.set(key, [...current, entry]);
  }
  clear(key: string) {
    this.store.delete(key);
  }
}

const loadAgents = jest.fn<Promise<any[]>, []>();

const chat = jest.fn(async (req: ChatRequest, _store: MockMemoryStore): Promise<ChatResponse> => {
  return {
    reply: `echo:${req.message}`,
  } as ChatResponse;
});

export const PersonaRegistry = {
  loadAgents,
  getAgent: jest.fn(async (id: string) => ({ id, name: `Agent ${id}`, model: "gpt-4o" })),
};

export const MemoryStore = MockMemoryStore as unknown as typeof import("@starships/agent-engine").MemoryStore;
export { chat }; 