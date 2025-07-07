import type { MemoryEntry, LLMChatPrompt } from "@starships/protocol";

/**
 * Build LLM chat prompt from system prompt, memory, and current message
 */
export function buildPrompt(
  systemPrompt: string | undefined, 
  memory: MemoryEntry[], 
  currentMessage: string,
  relevantContext?: string,
  codexContext?: string
): LLMChatPrompt {
  const messages: LLMChatPrompt['messages'] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  if (codexContext) {
    messages.push({ role: "system", content: codexContext });
  }

  if (relevantContext) {
    messages.push({ role: "system", content: `Relevant context from conversation history:\n${relevantContext}` });
  }

  const memoryMessages = memory.map(entry => ({
    role: entry.role,
    content: entry.content,
  }));
  
  messages.push(...memoryMessages);
  messages.push({ role: "user" as const, content: currentMessage });

  return { messages };
} 