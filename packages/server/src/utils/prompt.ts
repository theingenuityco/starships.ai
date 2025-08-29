import type { MemoryEntry, LLMChatPrompt } from "@starships/protocol";

/**
 * Build LLM chat prompt from system prompt, memory, and current message
 * Moved from agents/prompt.ts to utils for cleaner architecture
 */
export function buildPrompt(
  systemPrompt: string | undefined, 
  memory: MemoryEntry[], 
  currentMessage: string,
  relevantContext?: string,
  visionContext?: string
): LLMChatPrompt {
  const messages: LLMChatPrompt['messages'] = [];

  // Combine all system context into a single system message
  let combinedSystemPrompt = '';
  
  // Add vision context FIRST to ensure it takes priority
  if (visionContext) {
    console.log('[PROMPT-BUILDER] Adding vision context, length:', visionContext.length);
    combinedSystemPrompt += visionContext + '\n\n';
  }
  
  // Then add the agent's base system prompt
  if (systemPrompt) {
    console.log('[PROMPT-BUILDER] Adding system prompt, length:', systemPrompt.length);
    combinedSystemPrompt += systemPrompt + '\n\n';
  }
  
  // Add relevant context from history
  if (relevantContext) {
    console.log('[PROMPT-BUILDER] Adding relevant context, length:', relevantContext.length);
    combinedSystemPrompt += `Relevant context from conversation history:\n${relevantContext}\n\n`;
  }
  
  // Add the combined system message
  if (combinedSystemPrompt.trim()) {
    console.log('[PROMPT-BUILDER] Final combined prompt length:', combinedSystemPrompt.length);
    messages.push({ role: "system", content: combinedSystemPrompt.trim() });
  }

  const memoryMessages = memory.map(entry => ({
    role: entry.role,
    content: entry.content,
  }));
  
  messages.push(...memoryMessages);
  messages.push({ role: "user" as const, content: currentMessage });

  return { messages };
}