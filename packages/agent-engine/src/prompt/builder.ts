import type { MemoryEntry, LLMChatPrompt } from "@starships/protocol";

/**
 * Build LLM chat prompt from system prompt, memory, and current message
 */
export function buildPrompt(
  systemPrompt: string | undefined, 
  memory: MemoryEntry[], 
  currentMessage: string,
  relevantContext?: string,
  visionContext?: string,
  expeditionContext?: string
): LLMChatPrompt {
  const messages: LLMChatPrompt['messages'] = [];

  // Combine all system context into a single system message
  let combinedSystemPrompt = '';
  
  // Add vision context FIRST to ensure it takes priority
  if (visionContext) {
    combinedSystemPrompt += visionContext + '\n\n';
  }
  
  // Then add the agent's base system prompt
  if (systemPrompt) {
    combinedSystemPrompt += systemPrompt + '\n\n';
  }
  
  // Add expedition context if available
  if (expeditionContext) {
    combinedSystemPrompt += expeditionContext + '\n\n';
  }
  
  // Add relevant context from history
  if (relevantContext) {
    combinedSystemPrompt += `Relevant context from conversation history:\n${relevantContext}\n\n`;
  }
  
  // Add the combined system message
  if (combinedSystemPrompt.trim()) {
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