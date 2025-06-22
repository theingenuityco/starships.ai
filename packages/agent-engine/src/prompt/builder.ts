import type { MemoryEntry } from "../types";

export function buildPrompt(systemPrompt: string | undefined, memory: MemoryEntry[], userMessage: string) {
  const messages = [] as Array<{ role: "system" | "assistant" | "user"; content: string }>;
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  // flatten memory into chat format
  memory.forEach((m) => messages.push({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: userMessage });
  return { messages };
} 