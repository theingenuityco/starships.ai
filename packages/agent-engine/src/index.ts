import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory, AetherCoreService } from "@starships/models";
import type { ChatRequest, ChatResponse, MemoryEntry } from "@starships/protocol";

// MCP Integration placeholder - will be properly implemented when types are available
interface MCPContext {
  availableTools: any[];
  toolsDescription: string;
}

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

  // NEW: Load MCP tools context for agent
  let mcpContext = "";
  try {
    const mcpContextData = await getMCPContext(req.user_id, req.agent_id);
    mcpContext = mcpContextData.toolsDescription;
  } catch (error) {
    console.error('Failed to load MCP context:', error);
    // Continue without MCP context - graceful degradation
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

  // NEW: Enhanced prompt with codex and MCP context
  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    codexContext,  // Existing parameter
    mcpContext     // NEW MCP PARAMETER
  );
  
  const provider = await ProviderFactory.getProvider(req.agent_id);
  
  const llm = await llmRepo.findById(agent.model);
  const opts = {
    stream: req.stream,
    temperature: llm?.temperature,
    maxTokens: llm?.maxTokens,
  };
  
  if (req.stream) {
    throw new Error('Use chatStream for streaming responses');
  }

  const result = await provider.complete(prompt, opts);

  // NEW: Process MCP tool calls if present
  let finalReply = result.reply;
  try {
    const mcpResult = await processMCPToolCalls(result.reply, req.user_id, req.agent_id);
    if (mcpResult.hasToolCalls) {
      finalReply = mcpResult.enhancedResponse;
      console.log(`[AGENT-ENGINE] Executed ${mcpResult.toolCalls.length} MCP tool calls`);
    }
  } catch (error) {
    console.error('Failed to process MCP tool calls:', error);
    // Continue with original response
  }

  const userTimestamp = Date.now();
  await store.append(sessionKey, { role: "user", content: req.message, timestamp: userTimestamp } as MemoryEntry);
  
  const assistantTimestamp = Date.now();
  await store.append(sessionKey, { role: "assistant", content: finalReply, timestamp: assistantTimestamp } as MemoryEntry);

  return { reply: finalReply, usage: result.usage };
}

/**
 * Process chat request through agent with streaming support
 */
async function* chatStream(req: ChatRequest, store: LangChainMemoryStore): AsyncGenerator<string, void, unknown> {
  const agentRepo = RepositoryFactory.getAgentRepository();
  const llmRepo = RepositoryFactory.getLLMRepository();
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  
  ProviderFactory.initialize(agentRepo, llmRepo);
  
  const agent = await agentRepo.findById(req.agent_id);
  
  if (!agent) {
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  // Load starship codex context for deployed agents
  let codexContext = "";
  try {
    const userStarships = await starshipRepo.findByOwner(req.user_id);
    if (userStarships.length > 0) {
      const activeStarship = userStarships[0];
      
      const isAgentDeployed = await AetherCoreService.isAgentDeployedOnStarship(
        activeStarship.id,
        req.agent_id
      );
      
      if (isAgentDeployed) {
        const projection = await AetherCoreService.getProjection(activeStarship.id, 'telos');
        if (projection) {
          codexContext = formatCodexContext(activeStarship, projection);
        }
      }
    }
  } catch (error) {
    console.error('Failed to load starship context:', error);
  }

  // Load MCP tools context for agent
  let mcpContext = "";
  try {
    const mcpContextData = await getMCPContext(req.user_id, req.agent_id);
    mcpContext = mcpContextData.toolsDescription;
  } catch (error) {
    console.error('Failed to load MCP context:', error);
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

  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    codexContext,
    mcpContext
  );
  
  const provider = await ProviderFactory.getProvider(req.agent_id);
  
  const llm = await llmRepo.findById(agent.model);
  const opts = {
    temperature: llm?.temperature,
    maxTokens: llm?.maxTokens,
  };
  
  // Store user message before streaming
  const userTimestamp = Date.now();
  await store.append(sessionKey, { role: "user", content: req.message, timestamp: userTimestamp } as MemoryEntry);
  
  let fullResponse = "";
  
  // Stream the response
  for await (const chunk of provider.completeStream(prompt, opts)) {
    fullResponse += chunk;
    yield chunk;
  }
  
  // Process MCP tool calls after streaming completes
  let finalResponse = fullResponse;
  try {
    const mcpResult = await processMCPToolCalls(fullResponse, req.user_id, req.agent_id);
    if (mcpResult.hasToolCalls) {
      finalResponse = mcpResult.enhancedResponse;
      // Yield the tool results
      const toolResultsText = finalResponse.substring(fullResponse.length);
      if (toolResultsText) {
        yield toolResultsText;
      }
      console.log(`[AGENT-ENGINE] Executed ${mcpResult.toolCalls.length} MCP tool calls in stream`);
    }
  } catch (error) {
    console.error('Failed to process MCP tool calls in stream:', error);
  }
  
  // Store assistant message after streaming completes
  const assistantTimestamp = Date.now();
  await store.append(sessionKey, { role: "assistant", content: finalResponse, timestamp: assistantTimestamp } as MemoryEntry);
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

// MCP Integration Functions (placeholder implementations)
async function getMCPContext(userId: string, agentId: string): Promise<MCPContext> {
  // This is a placeholder - in the real implementation, this would call MCPService
  // For now, return empty context to avoid breaking the build
  return {
    availableTools: [],
    toolsDescription: ''
  };
}

async function processMCPToolCalls(response: string, userId: string, agentId: string): Promise<{
  hasToolCalls: boolean;
  toolCalls: any[];
  toolResults: any[];
  enhancedResponse: string;
}> {
  // This is a placeholder - in the real implementation, this would:
  // 1. Parse tool calls from response
  // 2. Execute them via MCPService
  // 3. Format results and enhance response
  
  // For now, return no tool calls to avoid breaking the build
  return {
    hasToolCalls: false,
    toolCalls: [],
    toolResults: [],
    enhancedResponse: response
  };
}

export { LangChainMemoryStore, chatStream };