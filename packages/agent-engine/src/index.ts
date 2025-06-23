import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory } from "@starships/neo4j-models";
import type { ChatRequest, ChatResponse, MemoryEntry } from "@starships/protocol";

export async function chat(req: ChatRequest, store: LangChainMemoryStore): Promise<ChatResponse> {
  // Initialize provider factory if not already done
  const agentRepo = RepositoryFactory.getAgentRepository();
  const modelRepo = RepositoryFactory.getModelRepository();
  ProviderFactory.initialize(agentRepo, modelRepo);
  
  // Get agent from repository
  const agent = await agentRepo.findById(req.agent_id);
  
  if (!agent) {
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  const sessionKey = store.makeKey(req.agent_id, req.user_id, req.channel_id);
  const memory = await store.get(sessionKey);

  // Semantic search for relevant context when memory is large
  let relevantContext = "";
  if (memory.length > 10) {
    const searchResult = await store.semanticSearch(sessionKey, req.message, 5);
    if (searchResult.entries.length > 0) {
      relevantContext = searchResult.entries
        .map(entry => `${entry.role}: ${entry.content}`)
        .join('\n');
    }
  }

  const prompt = buildPrompt(agent.systemPrompt, memory, req.message, relevantContext);
  
  // Get provider and complete request
  const provider = await ProviderFactory.getProvider(req.agent_id);
  
  // Get model config for temperature and maxTokens
  const model = await modelRepo.findById(agent.model);
  const opts = {
    stream: req.stream,
    temperature: model?.temperature,
    maxTokens: model?.maxTokens,
  };
  
  const result = await provider.complete(prompt, opts);

  // Persist memory
  const userTimestamp = Date.now();
  await store.append(sessionKey, { role: "user", content: req.message, timestamp: userTimestamp } as MemoryEntry);
  
  const assistantTimestamp = Date.now();
  await store.append(sessionKey, { role: "assistant", content: result.reply, timestamp: assistantTimestamp } as MemoryEntry);

  return { reply: result.reply, usage: result.usage };
}

export { LangChainMemoryStore }; 