import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory, AetherCoreService, VisionFileService } from "@starships/models";
import type { ChatRequest, ChatResponse, MemoryEntry } from "@starships/protocol";

/**
 * Process chat request through agent with memory and context
 */
export async function chat(req: ChatRequest, store: LangChainMemoryStore): Promise<ChatResponse> {
  const agentRepo = RepositoryFactory.getAgentRepository();
  const llmRepo = RepositoryFactory.getLLMRepository();
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  
  ProviderFactory.initialize(agentRepo, llmRepo);
  
  const agent = await agentRepo.findById(req.agent_id);
  
  if (!agent) {
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  // SIMPLE VISION CONTEXT LOADING
  let codexContext = "";
  try {
    const userStarships = await starshipRepo.findByOwner(req.user_id);
    if (userStarships.length > 0) {
      const activeStarship = userStarships[0];
      
      // Check if agent is deployed
      const isAgentDeployed = await AetherCoreService.isAgentDeployedOnStarship(
        activeStarship.id,
        req.agent_id
      );
      
      if (isAgentDeployed) {
        // BLOCK AGENT IF NO VISION
        const hasVision = await VisionFileService.hasVisionContent(activeStarship.id);
        if (!hasVision) {
          throw new Error('Vision required: Please create a vision statement in the Vision Chamber before using agents.');
        }
        
        // LOAD VISION FROM FILE
        const vision = await VisionFileService.readVision(activeStarship.id);
        if (vision) {
          codexContext = `\n\nSTARSHIP VISION:\n${vision}\n\nProvide responses aligned with this vision.\n`;
        }
      }
    }
  } catch (error) {
    console.error('Vision loading failed:', error);
    throw error; // Re-throw to block agent
  }

  const sessionKey = store.makeKey(req.agent_id, req.user_id, req.channel_id);
  const memory = await store.get(sessionKey);

  let relevantContext = "";
  if (memory.length > 10) {
    const searchResult = await store.semanticSearch(sessionKey, req.message, 5);
    if (searchResult.entries.length > 0) {
      relevantContext = searchResult.entries
        .map(entry => `${entry.role}: ${entry.content}`)
        .join('\n');
    }
  }

  // NEW: Enhanced prompt with codex context
  const prompt = buildPrompt(
    agent.systemPrompt, 
    memory, 
    req.message, 
    relevantContext,
    codexContext  // NEW PARAMETER
  );
  
  const provider = await ProviderFactory.getProvider(req.agent_id);
  
  const llm = await llmRepo.findById(agent.model);
  const opts = {
    stream: req.stream,
    temperature: llm?.temperature,
    maxTokens: llm?.maxTokens,
  };
  
  const result = await provider.complete(prompt, opts);

  const userTimestamp = Date.now();
  await store.append(sessionKey, { role: "user", content: req.message, timestamp: userTimestamp } as MemoryEntry);
  
  const assistantTimestamp = Date.now();
  await store.append(sessionKey, { role: "assistant", content: result.reply, timestamp: assistantTimestamp } as MemoryEntry);

  return { reply: result.reply, usage: result.usage };
}


export { LangChainMemoryStore }; 