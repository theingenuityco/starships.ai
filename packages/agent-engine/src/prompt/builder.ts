import type { MemoryEntry } from "@starships/protocol";

export function buildPrompt(
  systemPrompt: string | undefined, 
  memory: MemoryEntry[], 
  userMessage: string, 
  relevantContext: string = ""
) {
  const messages = [] as Array<{ role: "system" | "assistant" | "user"; content: string }>;
  
  let finalSystemPrompt = systemPrompt || "";
  if (relevantContext) {
    finalSystemPrompt += `\n\nRelevant context from conversation history:\n${relevantContext}`;
  }
  
  if (finalSystemPrompt) {
    messages.push({ role: "system", content: finalSystemPrompt });
  }
  
  // flatten memory into chat format
  memory.forEach((m) => messages.push({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: userMessage });
  return { messages };
} 