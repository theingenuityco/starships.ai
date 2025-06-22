import { buildPrompt } from "./prompt/builder";
import { MemoryStore } from "./memoryStore";
import { MockLLMProvider } from "./llm/mock";
import { LLMProvider } from "./llm/provider";
import { RepositoryFactory } from "@starships/neo4j-models";
import type { ChatRequest, ChatResponse, MemoryEntry } from "@starships/protocol";

// TODO: swap provider implementation by ENV later
const provider: LLMProvider = new MockLLMProvider();

export async function chat(req: ChatRequest, store: MemoryStore): Promise<ChatResponse> {
  // Use Neo4j to get agent instead of PersonaRegistry
  const agentRepo = RepositoryFactory.getAgentRepository();
  const agent = await agentRepo.findById(req.agent_id);
  
  if (!agent) {
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  const sessionKey = MemoryStore.makeKey(req.user_id, req.agent_id, req.channel_id ?? "default");
  const memory = store.get(sessionKey);

  const prompt = buildPrompt(agent.systemPrompt, memory, req.message);
  const result = await provider.complete(prompt); // non-stream for now

  // persist memory
  const now = Date.now();
  store.append(sessionKey, { role: "user", content: req.message, timestamp: now } as MemoryEntry);
  store.append(sessionKey, { role: "assistant", content: result.reply, timestamp: now } as MemoryEntry);

  return { reply: result.reply, usage: result.usage };
}

export { MemoryStore }; 