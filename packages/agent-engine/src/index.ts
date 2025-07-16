import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory, VisionFileService } from "@starships/models";
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
  console.log('🚀 [AGENT-ENGINE] Starting chat request:', {
    agent_id: req.agent_id,
    user_id: req.user_id,
    channel_id: req.channel_id,
    message: req.message,
    stream: req.stream,
    timestamp: new Date().toISOString()
  });

  const agentRepo = RepositoryFactory.getAgentRepository();
  const llmRepo = RepositoryFactory.getLLMRepository();
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  
  ProviderFactory.initialize(agentRepo, llmRepo);
  
  const agent = await agentRepo.findById(req.agent_id);
  
  if (!agent) {
    console.error('❌ [AGENT-ENGINE] Agent not found:', req.agent_id);
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  console.log('✅ [AGENT-ENGINE] Agent found:', {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    systemPrompt: agent.systemPrompt?.substring(0, 100) + '...'
  });

  // SIMPLE VISION CONTEXT LOADING
  console.log('🔍 [AGENT-ENGINE] Starting vision context loading...');
  let codexContext = "";
  try {
    const userStarships = await starshipRepo.findByOwner(req.user_id);
    console.log('📊 [AGENT-ENGINE] User starships found:', userStarships.length);
    
    if (userStarships.length > 0) {
      const activeStarship = userStarships[0];
      console.log('🚢 [AGENT-ENGINE] Active starship:', {
        id: activeStarship.id,
        name: activeStarship.name,
        class: activeStarship.class
      });
      
      // Check if agent is deployed
      const deployedAgents = await starshipRepo.getDeployedAgents(activeStarship.id);
      const isAgentDeployed = deployedAgents.some(agent => agent.id === req.agent_id);
      console.log('🤖 [AGENT-ENGINE] Agent deployment check:', {
        isDeployed: isAgentDeployed,
        deployedAgents: deployedAgents.map(a => a.id),
        requestedAgent: req.agent_id
      });
      
      if (isAgentDeployed) {
        // BLOCK AGENT IF NO VISION
        const hasVision = await VisionFileService.hasVisionContent(activeStarship.id);
        console.log('👁️ [AGENT-ENGINE] Vision check:', { hasVision });
        
        if (!hasVision) {
          console.error('❌ [AGENT-ENGINE] Vision required but not found');
          throw new Error('Vision required: Please create a vision statement in the Vision Chamber before using agents.');
        }
        
        // LOAD VISION FROM FILE
        const vision = await VisionFileService.readVision(activeStarship.id);
        console.log('📖 [AGENT-ENGINE] Vision loaded:', {
          length: vision?.length || 0,
          preview: vision?.substring(0, 100) + '...'
        });
        
        if (vision) {
          codexContext = `\n\nSTARSHIP VISION:\n${vision}\n\nProvide responses aligned with this vision.\n`;
        }
      } else {
        console.log('⚠️ [AGENT-ENGINE] Agent not deployed, skipping vision loading');
      }
    } else {
      console.log('⚠️ [AGENT-ENGINE] No starships found for user');
    }
  } catch (error) {
    console.error('❌ [AGENT-ENGINE] Vision loading failed:', error);
    throw error; // Re-throw to block agent
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
  console.log('🧠 [AGENT-ENGINE] Memory loaded:', {
    sessionKey,
    memoryEntries: memory.length,
    recentEntries: memory.slice(-3).map(m => `${m.role}: ${m.content.substring(0, 50)}...`)
  });

  let relevantContext = "";
  if (memory.length > 10) {
    const searchResult = await store.semanticSearch(sessionKey, req.message, 5);
    console.log('🔍 [AGENT-ENGINE] Semantic search results:', {
      entriesFound: searchResult.entries.length,
      entries: searchResult.entries.map(e => `${e.role}: ${e.content.substring(0, 50)}...`)
    });
    
    if (searchResult.entries.length > 0) {
      relevantContext = searchResult.entries
        .map(entry => `${entry.role}: ${entry.content}`)
        .join('\n');
    }
  }

  // NEW: Enhanced prompt with codex and MCP context
  console.log('📝 [AGENT-ENGINE] Building prompt with:', {
    hasSystemPrompt: !!agent.systemPrompt,
    memoryEntries: memory.length,
    hasRelevantContext: !!relevantContext,
    hasCodexContext: !!codexContext,
    codexContextLength: codexContext.length,
    hasMcpContext: !!mcpContext
  });

  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    codexContext,  // Existing parameter
    mcpContext     // NEW MCP PARAMETER
  );
  
  console.log('✅ [AGENT-ENGINE] Prompt built:', {
    totalMessages: prompt.messages.length,
    systemMessages: prompt.messages.filter(m => m.role === 'system').length,
    userMessages: prompt.messages.filter(m => m.role === 'user').length,
    assistantMessages: prompt.messages.filter(m => m.role === 'assistant').length
  });
  
  const provider = await ProviderFactory.getProvider(req.agent_id);
  console.log('🤖 [AGENT-ENGINE] Provider loaded for agent:', req.agent_id);
  
  const llm = await llmRepo.findById(agent.model);
  const opts = {
    stream: req.stream,
    temperature: llm?.temperature,
    maxTokens: llm?.maxTokens,
  };
  
  console.log('⚙️ [AGENT-ENGINE] LLM configuration:', {
    modelId: agent.model,
    modelName: llm?.name,
    temperature: llm?.temperature,
    maxTokens: llm?.maxTokens,
    stream: req.stream
  });
  
  if (req.stream) {
    throw new Error('Use chatStream for streaming responses');
  }

  console.log('🚀 [AGENT-ENGINE] Sending request to LLM provider...');
  const startTime = Date.now();
  const result = await provider.complete(prompt, opts);
  const endTime = Date.now();
  
  console.log('✅ [AGENT-ENGINE] LLM response received:', {
    responseTime: `${endTime - startTime}ms`,
    replyLength: result.reply.length,
    replyPreview: result.reply.substring(0, 200) + '...',
    usage: result.usage
  });

<<<<<<< HEAD
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

=======
  console.log('💾 [AGENT-ENGINE] Storing messages in memory...');
>>>>>>> 397877d0688f0ed967af550fed1106d6cac872a0
  const userTimestamp = Date.now();
  await store.append(sessionKey, { role: "user", content: req.message, timestamp: userTimestamp } as MemoryEntry);
  
  const assistantTimestamp = Date.now();
  await store.append(sessionKey, { role: "assistant", content: finalReply, timestamp: assistantTimestamp } as MemoryEntry);

<<<<<<< HEAD
  return { reply: finalReply, usage: result.usage };
=======
  console.log('🎉 [AGENT-ENGINE] Chat completed successfully:', {
    finalReplyLength: result.reply.length,
    totalProcessingTime: `${Date.now() - startTime}ms`
  });

  return { reply: result.reply, usage: result.usage };
>>>>>>> 397877d0688f0ed967af550fed1106d6cac872a0
}

/**
 * Process chat request through agent with streaming support
 */
async function* chatStream(req: ChatRequest, store: LangChainMemoryStore): AsyncGenerator<string, void, unknown> {
  console.log('🌊 [AGENT-ENGINE-STREAM] Starting streaming chat request:', {
    agent_id: req.agent_id,
    user_id: req.user_id,
    channel_id: req.channel_id,
    message: req.message,
    timestamp: new Date().toISOString()
  });

  const agentRepo = RepositoryFactory.getAgentRepository();
  const llmRepo = RepositoryFactory.getLLMRepository();
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  
  ProviderFactory.initialize(agentRepo, llmRepo);
  
  const agent = await agentRepo.findById(req.agent_id);
  
  if (!agent) {
    console.error('❌ [AGENT-ENGINE-STREAM] Agent not found:', req.agent_id);
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  console.log('✅ [AGENT-ENGINE-STREAM] Agent found:', {
    id: agent.id,
    name: agent.name,
    model: agent.model
  });

  // SIMPLE VISION CONTEXT LOADING (consistent with non-streaming)
  let codexContext = "";
  try {
    const userStarships = await starshipRepo.findByOwner(req.user_id);
    
    if (userStarships.length > 0) {
      const activeStarship = userStarships[0];
      
      // Check if agent is deployed
      const deployedAgents = await starshipRepo.getDeployedAgents(activeStarship.id);
      const isAgentDeployed = deployedAgents.some(agent => agent.id === req.agent_id);
      
      if (isAgentDeployed) {
        // BLOCK AGENT IF NO VISION
        const hasVision = await VisionFileService.hasVisionContent(activeStarship.id);
        
        if (!hasVision) {
          console.error('❌ [AGENT-ENGINE-STREAM] Vision required but not found');
          throw new Error('Vision required: Please create a vision statement in the Vision Chamber before using agents.');
        }
        
        // LOAD VISION FROM FILE
        const vision = await VisionFileService.readVision(activeStarship.id);
        
        if (vision) {
          codexContext = `\n\nSTARSHIP VISION:\n${vision}\n\nProvide responses aligned with this vision.\n`;
          console.log('✅ [AGENT-ENGINE-STREAM] Vision context loaded');
        }
      } else {
        console.log('⚠️ [AGENT-ENGINE-STREAM] Agent not deployed - vision skipped');
      }
    } else {
      console.log('⚠️ [AGENT-ENGINE-STREAM] No starships found - vision skipped');
    }
  } catch (error) {
    console.error('❌ [AGENT-ENGINE-STREAM] Vision loading failed:', error);
    throw error; // Re-throw to block agent
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
  console.log('🧠 [AGENT-ENGINE-STREAM] Memory loaded:', {
    sessionKey,
    memoryEntries: memory.length,
    recentEntries: memory.slice(-3).map(m => `${m.role}: ${m.content.substring(0, 50)}...`)
  });

  let relevantContext = "";
  if (memory.length > 10) {
    const searchResult = await store.semanticSearch(sessionKey, req.message, 5);
    console.log('🔍 [AGENT-ENGINE-STREAM] Semantic search results:', {
      entriesFound: searchResult.entries.length,
      entries: searchResult.entries.map(e => `${e.role}: ${e.content.substring(0, 50)}...`)
    });
    
    if (searchResult.entries.length > 0) {
      relevantContext = searchResult.entries
        .map(entry => `${entry.role}: ${entry.content}`)
        .join('\n');
    }
  }

  console.log('📝 [AGENT-ENGINE-STREAM] Building prompt with:', {
    hasSystemPrompt: !!agent.systemPrompt,
    memoryEntries: memory.length,
    hasRelevantContext: !!relevantContext,
    hasCodexContext: !!codexContext,
    codexContextLength: codexContext.length
  });

  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    codexContext,
    mcpContext
  );
  
  console.log('✅ [AGENT-ENGINE-STREAM] Prompt built:', {
    totalMessages: prompt.messages.length,
    systemMessages: prompt.messages.filter(m => m.role === 'system').length,
    userMessages: prompt.messages.filter(m => m.role === 'user').length,
    assistantMessages: prompt.messages.filter(m => m.role === 'assistant').length
  });
  
  const provider = await ProviderFactory.getProvider(req.agent_id);
  console.log('🤖 [AGENT-ENGINE-STREAM] Provider loaded for agent:', req.agent_id);
  
  const llm = await llmRepo.findById(agent.model);
  const opts = {
    temperature: llm?.temperature,
    maxTokens: llm?.maxTokens,
  };
  
  console.log('⚙️ [AGENT-ENGINE-STREAM] LLM configuration:', {
    modelId: agent.model,
    modelName: llm?.name,
    temperature: llm?.temperature,
    maxTokens: llm?.maxTokens
  });
  
  // Store user message before streaming
  console.log('💾 [AGENT-ENGINE-STREAM] Storing user message in memory...');
  const userTimestamp = Date.now();
  await store.append(sessionKey, { role: "user", content: req.message, timestamp: userTimestamp } as MemoryEntry);
  
  let fullResponse = "";
  let chunkCount = 0;
  
  console.log('🌊 [AGENT-ENGINE-STREAM] Starting streaming response...');
  const streamStartTime = Date.now();
  
  // Stream the response
  for await (const chunk of provider.completeStream(prompt, opts)) {
    fullResponse += chunk;
    chunkCount++;
    
    // Log every 10th chunk to avoid spam
    if (chunkCount % 10 === 0) {
      console.log(`🔄 [AGENT-ENGINE-STREAM] Chunk ${chunkCount}:`, {
        chunkLength: chunk.length,
        totalLength: fullResponse.length,
        elapsedTime: `${Date.now() - streamStartTime}ms`
      });
    }
    
    yield chunk;
  }
  
<<<<<<< HEAD
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
=======
  const streamEndTime = Date.now();
  console.log('✅ [AGENT-ENGINE-STREAM] Streaming completed:', {
    totalChunks: chunkCount,
    totalResponseLength: fullResponse.length,
    streamingTime: `${streamEndTime - streamStartTime}ms`,
    responsePreview: fullResponse.substring(0, 200) + '...'
  });
>>>>>>> 397877d0688f0ed967af550fed1106d6cac872a0
  
  // Store assistant message after streaming completes
  console.log('💾 [AGENT-ENGINE-STREAM] Storing assistant message in memory...');
  const assistantTimestamp = Date.now();
<<<<<<< HEAD
  await store.append(sessionKey, { role: "assistant", content: finalResponse, timestamp: assistantTimestamp } as MemoryEntry);
=======
  await store.append(sessionKey, { role: "assistant", content: fullResponse, timestamp: assistantTimestamp } as MemoryEntry);
  
  console.log('🎉 [AGENT-ENGINE-STREAM] Streaming chat completed successfully');
>>>>>>> 397877d0688f0ed967af550fed1106d6cac872a0
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