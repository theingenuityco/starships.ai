import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory, AetherCoreService } from "@starships/models";
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

  // NEW: Load starship codex context for deployed agents
  let codexContext = "";
  try {
    const userStarships = await starshipRepo.findByOwner(req.user_id);
    if (userStarships.length > 0) {
      // Use first starship as active (TODO: support starship selection)
      const activeStarship = userStarships[0];
      
      // Check if agent is deployed on this starship
      const isAgentDeployed = await AetherCoreService.isAgentDeployedOnStarship(
        activeStarship.id, 
        req.agent_id
      );
      
      if (isAgentDeployed) {
        // Get Telos projection for mission-focused context
        const projection = await AetherCoreService.getProjection(activeStarship.id, 'telos');
        if (projection) {
          codexContext = formatCodexContext(activeStarship, projection);
        }
      }
    }
  } catch (error) {
    console.error('Failed to load starship context:', error);
    // Continue without codex context - graceful degradation
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

// NEW: Format codex context for prompt injection
function formatCodexContext(starship: any, projection: any): string {
  let context = `\n\nSTARSHIP CONTEXT - ${starship.class.charAt(0).toUpperCase() + starship.class.slice(1)} Class Vessel\n`;
  context += `Starship: ${starship.name}\n`;
  
  if (projection.vision) {
    context += `Mission Vision: ${projection.vision}\n`;
  }
  
  if (projection.goals && projection.goals.length > 0) {
    context += `Active Goals:\n`;
    projection.goals.forEach((goal: any) => {
      context += `- ${goal.description} (${goal.type})\n`;
    });
  }
  
  if (projection.constraints && projection.constraints.length > 0) {
    context += `Mission Constraints:\n`;
    projection.constraints.forEach((constraint: any) => {
      context += `- ${constraint.description}\n`;
    });
  }
  
  context += `\nProvide responses that align with this starship's mission and constraints.`;
  
  return context;
}

export { LangChainMemoryStore }; 