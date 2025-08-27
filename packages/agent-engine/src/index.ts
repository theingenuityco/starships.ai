// Export main chat functions from chat.ts
export { chat } from './chat';

// Export memory and other utilities
export { LangChainMemoryStore } from "./memory/langchain-memory";

// Export LLM Provider Factory and LangChainProvider
export { ProviderFactory } from './llm/provider-factory';
export { LangChainProvider } from './llm/langchain-provider';

// Export native tool wrapper
export { NativeToolWrapper } from './tools/NativeToolWrapper';
export type { NativeToolConfig } from './tools/NativeToolWrapper';

// Create a minimal streaming function wrapper for backward compatibility
import type { ChatRequest } from "@starships/protocol";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory } from "@starships/models";
import { buildPrompt } from "./prompt/builder";

/**
 * Simple streaming chat implementation for backward compatibility
 */
export async function* chatStream(
  req: ChatRequest,
  store: LangChainMemoryStore
): AsyncGenerator<string, void, unknown> {
  // This is a simplified streaming implementation
  // For full streaming with native tools, use the chat function from chat.ts
  
  // Validate that agent_id is provided for agent chat
  if (!req.agent_id) {
    throw new Error('agent_id is required for agent chat stream');
  }
  
  const agentRepo = RepositoryFactory.getAgentRepository();
  const llmRepo = RepositoryFactory.getLLMRepository();
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  const visionRepo = RepositoryFactory.getVisionRepository();
  const userRepo = RepositoryFactory.getUserRepository();
  
  ProviderFactory.initialize(agentRepo, llmRepo);

  const agent = await agentRepo.findById(req.agent_id);
  if (!agent) {
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  // Get memory and build prompt
  const sessionKey = store.makeKey(req.agent_id!, req.user_id);
  const memory = await store.get(sessionKey);
  
  const prompt = buildPrompt(
    agent.systemPrompt || "You are a helpful assistant.",
    memory,
    req.message
  );

  const provider = await ProviderFactory.getProvider(req.agent_id!);
  
  // Stream the response
  let fullResponse = '';
  for await (const chunk of provider.completeStream(prompt, {})) {
    fullResponse += chunk;
    yield chunk;
  }

  // Store messages in memory
  await store.append(sessionKey, {
    role: 'user',
    content: req.message,
    timestamp: Date.now()
  });
  
  await store.append(sessionKey, {
    role: 'assistant',
    content: fullResponse,
    timestamp: Date.now()
  });
}
