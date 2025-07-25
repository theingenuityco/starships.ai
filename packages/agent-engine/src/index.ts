import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory, AgentExpeditionContextService } from "@starships/models";
import type { ChatRequest, ChatResponse, MemoryEntry } from "@starships/protocol";

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
    timestamp: new Date().toISOString(),
  });

  const agentRepo = RepositoryFactory.getAgentRepository();
  const llmRepo = RepositoryFactory.getLLMRepository();
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  const visionRepo = RepositoryFactory.getVisionRepository();
  const userRepo = RepositoryFactory.getUserRepository();
  
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
    systemPrompt: agent.systemPrompt?.substring(0, 100) + '...',
  });

  // ENHANCED USER ID RESOLUTION WITH COMPREHENSIVE FALLBACK STRATEGIES
  console.log('🔍 [AGENT-ENGINE] Starting enhanced vision context loading...');
  console.log('👤 [AGENT-ENGINE] Original Kinde user ID:', req.user_id);
  
  // Step 1: Attempt to resolve internal user ID from Kinde user ID
  let internalUserId = req.user_id;
  let userResolutionSuccess = false;
  let fallbackToKindeId = false;
  
  try {
    console.log('🔍 [AGENT-ENGINE] Attempting to resolve internal user from Kinde ID...');
    const user = await userRepo.findByKindeId(req.user_id);
    if (user) {
      internalUserId = user.id;
      userResolutionSuccess = true;
      console.log('✅ [AGENT-ENGINE] Internal user found successfully:', {
        internalUserId: internalUserId,
        username: user.username,
        email: user.email,
        kindeId: user.kindeId
      });
    } else {
      console.warn('⚠️ [AGENT-ENGINE] No internal user found for Kinde ID');
      console.log('🔄 [AGENT-ENGINE] Will attempt starship lookup with Kinde ID as fallback');
      fallbackToKindeId = true;
    }
  } catch (userError) {
    console.error('❌ [AGENT-ENGINE] Error during user ID resolution:', {
      error: (userError as Error).message,
      stack: (userError as Error).stack
    });
    console.log('🔄 [AGENT-ENGINE] Will attempt starship lookup with Kinde ID as fallback');
    fallbackToKindeId = true;
  }
  
  let visionContext = "";
  let expeditionContext = "";
  let starshipLookupStrategies: string[] = [];
  
  // Load expedition context for agent awareness
  try {
    const contextService = AgentExpeditionContextService.getInstance();
    expeditionContext = await contextService.getAgentExpeditionContext(req.agent_id);
    
    if (expeditionContext) {
      console.log('🚢 [AGENT-ENGINE] Expedition context loaded for agent:', {
        agentId: req.agent_id,
        contextLength: expeditionContext.length,
        hasExpedition: true
      });
    }
  } catch (contextError) {
    console.log('⚠️ [AGENT-ENGINE] Could not load expedition context:', contextError);
    // Continue without expedition context
  }
  
  // Step 2: Enhanced starship lookup with multiple strategies
  try {
    console.log('🚢 [AGENT-ENGINE] Starting enhanced starship lookup...');
    
    // Strategy 1: Use resolved internal user ID
    if (userResolutionSuccess) {
      starshipLookupStrategies.push(`internal-user-id:${internalUserId}`);
    }
    
    // Strategy 2: Use Kinde ID as fallback (in case starships were created with Kinde IDs)
    if (fallbackToKindeId || !userResolutionSuccess) {
      starshipLookupStrategies.push(`kinde-id-fallback:${req.user_id}`);
    }
    
    console.log('🎯 [AGENT-ENGINE] Starship lookup strategies:', starshipLookupStrategies);
    
    let userStarships: any[] = [];
    let successfulStrategy = '';
    
    // Try each strategy until we find starships
    for (const strategy of starshipLookupStrategies) {
      const [strategyType, userId] = strategy.split(':');
      console.log(`🔍 [AGENT-ENGINE] Trying strategy "${strategyType}" with user ID: ${userId}`);
      
      try {
        const starshipsForStrategy = await starshipRepo.findByOwner(userId);
        console.log(`📊 [AGENT-ENGINE] Strategy "${strategyType}" found ${starshipsForStrategy.length} starships`);
        
        if (starshipsForStrategy.length > 0) {
          userStarships = starshipsForStrategy;
          successfulStrategy = strategyType;
          console.log(`✅ [AGENT-ENGINE] Using starships from strategy: ${strategyType}`);
          break;
        }
      } catch (strategyError) {
        console.error(`❌ [AGENT-ENGINE] Strategy "${strategyType}" failed:`, (strategyError as Error).message);
        continue;
      }
    }
    
    console.log('📊 [AGENT-ENGINE] Final starship lookup result:', {
      starshipsFound: userStarships.length,
      successfulStrategy: successfulStrategy,
      starshipDetails: userStarships.map(s => ({
        id: s.id,
        name: s.name,
        class: s.class,
        ownerId: s.ownerId,
        status: s.status
      }))
    });
    
    if (userStarships.length > 0) {
      // Select the first active starship, or first starship if none are active
      const activeStarship = userStarships.find(s => s.status === 'active') || userStarships[0];
      console.log('🎯 [AGENT-ENGINE] Active starship selected:', {
        id: activeStarship.id,
        name: activeStarship.name,
        class: activeStarship.class,
        ownerId: activeStarship.ownerId,
        status: activeStarship.status,
        selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
      });
      
      // Step 3: Enhanced vision loading with validation
      console.log('🔍 [AGENT-ENGINE] Querying vision for starship ID:', activeStarship.id);
      const vision = await visionRepo.findByStarship(activeStarship.id);
      
      console.log('👁️ [AGENT-ENGINE] Vision database lookup result:', {
        visionFound: !!vision,
        visionId: vision?.id,
        starshipId: vision?.starshipId,
        hasStatement: !!vision?.statement,
        statementLength: vision?.statement?.length || 0,
        refinementCount: vision?.refinementCount || 0,
        lastRefined: vision?.lastRefined,
        createdAt: vision?.createdAt
      });
      
      if (vision?.statement && vision.statement.trim().length > 0) {
        console.log('📖 [AGENT-ENGINE] Vision loaded successfully from database:', {
          length: vision.statement.length,
          preview: vision.statement.substring(0, 150) + '...',
          refinementCount: vision.refinementCount || 0,
          lastRefined: vision.lastRefined
        });
        
        visionContext = `\n\nSTARSHIP VISION:\n${vision.statement}\n\nProvide responses aligned with this vision.\n`;
        console.log('✅ [AGENT-ENGINE] Vision context prepared successfully, length:', visionContext.length);
      } else {
        console.log('📝 [AGENT-ENGINE] Vision exists but has no usable statement');
        if (vision) {
          console.log('🔍 [AGENT-ENGINE] Vision investigation details:', {
            id: vision.id,
            starshipId: vision.starshipId,
            statement: vision.statement,
            statementType: typeof vision.statement,
            statementTrimmed: vision.statement?.trim(),
            refinementCount: vision.refinementCount
          });
        }
        console.log('⚠️ [AGENT-ENGINE] Proceeding without vision context - empty/null statement');
      }
    } else {
      console.error('❌ [AGENT-ENGINE] CRITICAL: No starships found for user with any strategy');
      console.error('🔍 [AGENT-ENGINE] Debug information:', {
        originalKindeId: req.user_id,
        resolvedInternalId: internalUserId,
        userResolutionSuccess: userResolutionSuccess,
        strategiesAttempted: starshipLookupStrategies,
        fallbackToKindeId: fallbackToKindeId
      });
      
      // This could indicate a data inconsistency issue that needs to be addressed
      console.log('⚠️ [AGENT-ENGINE] Proceeding without vision context - no starships found');
    }
  } catch (error) {
    console.error('❌ [AGENT-ENGINE] Vision loading failed with critical error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      name: (error as Error).name,
      originalKindeId: req.user_id,
      resolvedInternalId: internalUserId
    });
    // Don't block agent - continue without vision context
    console.log('🔄 [AGENT-ENGINE] Continuing without vision context due to critical error');
  }

  const sessionKey = store.makeKey(req.agent_id, req.user_id, req.channel_id);
  const memory = await store.get(sessionKey);
  console.log('🧠 [AGENT-ENGINE] Memory loaded:', {
    sessionKey,
    memoryEntries: memory.length,
    recentEntries: memory.slice(-3).map((m) => `${m.role}: ${m.content.substring(0, 50)}...`),
  });

  let relevantContext = '';
  if (memory.length > 10) {
    const searchResult = await store.semanticSearch(sessionKey, req.message, 5);
    console.log('🔍 [AGENT-ENGINE] Semantic search results:', {
      entriesFound: searchResult.entries.length,
      entries: searchResult.entries.map((e) => `${e.role}: ${e.content.substring(0, 50)}...`),
    });

    if (searchResult.entries.length > 0) {
      relevantContext = searchResult.entries
        .map((entry) => `${entry.role}: ${entry.content}`)
        .join('\n');
    }
  }

  // NEW: Enhanced prompt with codex context
  console.log('📝 [AGENT-ENGINE] Building prompt with:', {
    hasSystemPrompt: !!agent.systemPrompt,
    memoryEntries: memory.length,
    hasRelevantContext: !!relevantContext,
    hasVisionContext: !!visionContext,
    visionContextLength: visionContext.length,
    hasExpeditionContext: !!expeditionContext,
    expeditionContextLength: expeditionContext.length
  });

  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    visionContext,
    expeditionContext
  );

  console.log('✅ [AGENT-ENGINE] Prompt built:', {
    totalMessages: prompt.messages.length,
    systemMessages: prompt.messages.filter((m) => m.role === 'system').length,
    userMessages: prompt.messages.filter((m) => m.role === 'user').length,
    assistantMessages: prompt.messages.filter((m) => m.role === 'assistant').length,
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
    stream: req.stream,
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
    usage: result.usage,
  });

  console.log('💾 [AGENT-ENGINE] Storing messages in memory...');
  const userTimestamp = Date.now();
  await store.append(sessionKey, {
    role: 'user',
    content: req.message,
    timestamp: userTimestamp,
  } as MemoryEntry);

  const assistantTimestamp = Date.now();
  await store.append(sessionKey, {
    role: 'assistant',
    content: result.reply,
    timestamp: assistantTimestamp,
  } as MemoryEntry);

  console.log('🎉 [AGENT-ENGINE] Chat completed successfully:', {
    finalReplyLength: result.reply.length,
    totalProcessingTime: `${Date.now() - startTime}ms`,
  });

  return { reply: result.reply, usage: result.usage };
}

/**
 * Process chat request through agent with streaming support
 */
async function* chatStream(
  req: ChatRequest,
  store: LangChainMemoryStore
): AsyncGenerator<string, void, unknown> {
  console.log('🌊 [AGENT-ENGINE-STREAM] Starting streaming chat request:', {
    agent_id: req.agent_id,
    user_id: req.user_id,
    channel_id: req.channel_id,
    message: req.message,
    timestamp: new Date().toISOString(),
  });

  const agentRepo = RepositoryFactory.getAgentRepository();
  const llmRepo = RepositoryFactory.getLLMRepository();
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  const visionRepo = RepositoryFactory.getVisionRepository();
  const userRepo = RepositoryFactory.getUserRepository();
  
  ProviderFactory.initialize(agentRepo, llmRepo);

  const agent = await agentRepo.findById(req.agent_id);

  if (!agent) {
    console.error('❌ [AGENT-ENGINE-STREAM] Agent not found:', req.agent_id);
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  console.log('✅ [AGENT-ENGINE-STREAM] Agent found:', {
    id: agent.id,
    name: agent.name,
    model: agent.model,
  });

  // ENHANCED USER ID RESOLUTION WITH COMPREHENSIVE FALLBACK STRATEGIES (STREAMING)
  console.log('🌊 [AGENT-ENGINE-STREAM] Starting enhanced vision context loading...');
  console.log('👤 [AGENT-ENGINE-STREAM] Original Kinde user ID:', req.user_id);
  
  // Step 1: Attempt to resolve internal user ID from Kinde user ID
  let internalUserId = req.user_id;
  let userResolutionSuccess = false;
  let fallbackToKindeId = false;
  
  try {
    console.log('🔍 [AGENT-ENGINE-STREAM] Attempting to resolve internal user from Kinde ID...');
    const user = await userRepo.findByKindeId(req.user_id);
    if (user) {
      internalUserId = user.id;
      userResolutionSuccess = true;
      console.log('✅ [AGENT-ENGINE-STREAM] Internal user found successfully:', {
        internalUserId: internalUserId,
        username: user.username,
        email: user.email,
        kindeId: user.kindeId
      });
    } else {
      console.warn('⚠️ [AGENT-ENGINE-STREAM] No internal user found for Kinde ID');
      console.log('🔄 [AGENT-ENGINE-STREAM] Will attempt starship lookup with Kinde ID as fallback');
      fallbackToKindeId = true;
    }
  } catch (userError) {
    console.error('❌ [AGENT-ENGINE-STREAM] Error during user ID resolution:', {
      error: (userError as Error).message,
      stack: (userError as Error).stack
    });
    console.log('🔄 [AGENT-ENGINE-STREAM] Will attempt starship lookup with Kinde ID as fallback');
    fallbackToKindeId = true;
  }
  
  let visionContext = "";
  let expeditionContext = "";
  let starshipLookupStrategies: string[] = [];
  
  // Load expedition context for agent awareness (STREAMING)
  try {
    const contextService = AgentExpeditionContextService.getInstance();
    expeditionContext = await contextService.getAgentExpeditionContext(req.agent_id);
    
    if (expeditionContext) {
      console.log('🚢 [AGENT-ENGINE-STREAM] Expedition context loaded for agent:', {
        agentId: req.agent_id,
        contextLength: expeditionContext.length,
        hasExpedition: true
      });
    }
  } catch (contextError) {
    console.log('⚠️ [AGENT-ENGINE-STREAM] Could not load expedition context:', contextError);
    // Continue without expedition context
  }
  
  // Step 2: Enhanced starship lookup with multiple strategies
  try {
    console.log('🚢 [AGENT-ENGINE-STREAM] Starting enhanced starship lookup...');
    
    // Strategy 1: Use resolved internal user ID
    if (userResolutionSuccess) {
      starshipLookupStrategies.push(`internal-user-id:${internalUserId}`);
    }
    
    // Strategy 2: Use Kinde ID as fallback (in case starships were created with Kinde IDs)
    if (fallbackToKindeId || !userResolutionSuccess) {
      starshipLookupStrategies.push(`kinde-id-fallback:${req.user_id}`);
    }
    
    console.log('🎯 [AGENT-ENGINE-STREAM] Starship lookup strategies:', starshipLookupStrategies);
    
    let userStarships: any[] = [];
    let successfulStrategy = '';
    
    // Try each strategy until we find starships
    for (const strategy of starshipLookupStrategies) {
      const [strategyType, userId] = strategy.split(':');
      console.log(`🔍 [AGENT-ENGINE-STREAM] Trying strategy "${strategyType}" with user ID: ${userId}`);
      
      try {
        const starshipsForStrategy = await starshipRepo.findByOwner(userId);
        console.log(`📊 [AGENT-ENGINE-STREAM] Strategy "${strategyType}" found ${starshipsForStrategy.length} starships`);
        
        if (starshipsForStrategy.length > 0) {
          userStarships = starshipsForStrategy;
          successfulStrategy = strategyType;
          console.log(`✅ [AGENT-ENGINE-STREAM] Using starships from strategy: ${strategyType}`);
          break;
        }
      } catch (strategyError) {
        console.error(`❌ [AGENT-ENGINE-STREAM] Strategy "${strategyType}" failed:`, (strategyError as Error).message);
        continue;
      }
    }
    
    console.log('📊 [AGENT-ENGINE-STREAM] Final starship lookup result:', {
      starshipsFound: userStarships.length,
      successfulStrategy: successfulStrategy,
      starshipDetails: userStarships.map(s => ({
        id: s.id,
        name: s.name,
        class: s.class,
        ownerId: s.ownerId,
        status: s.status
      }))
    });
    
    if (userStarships.length > 0) {
      // Select the first active starship, or first starship if none are active
      const activeStarship = userStarships.find(s => s.status === 'active') || userStarships[0];
      console.log('🎯 [AGENT-ENGINE-STREAM] Active starship selected:', {
        id: activeStarship.id,
        name: activeStarship.name,
        class: activeStarship.class,
        ownerId: activeStarship.ownerId,
        status: activeStarship.status,
        selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
      });
      
      // Step 3: Enhanced vision loading with validation
      console.log('🔍 [AGENT-ENGINE-STREAM] Querying vision for starship ID:', activeStarship.id);
      const vision = await visionRepo.findByStarship(activeStarship.id);
      
      console.log('👁️ [AGENT-ENGINE-STREAM] Vision database lookup result:', {
        visionFound: !!vision,
        visionId: vision?.id,
        starshipId: vision?.starshipId,
        hasStatement: !!vision?.statement,
        statementLength: vision?.statement?.length || 0,
        refinementCount: vision?.refinementCount || 0,
        lastRefined: vision?.lastRefined,
        createdAt: vision?.createdAt
      });
      
      if (vision?.statement && vision.statement.trim().length > 0) {
        console.log('📖 [AGENT-ENGINE-STREAM] Vision loaded successfully from database:', {
          length: vision.statement.length,
          preview: vision.statement.substring(0, 150) + '...',
          refinementCount: vision.refinementCount || 0,
          lastRefined: vision.lastRefined
        });
        
        visionContext = `\n\nSTARSHIP VISION:\n${vision.statement}\n\nProvide responses aligned with this vision.\n`;
        console.log('✅ [AGENT-ENGINE-STREAM] Vision context prepared successfully, length:', visionContext.length);
      } else {
        console.log('📝 [AGENT-ENGINE-STREAM] Vision exists but has no usable statement');
        if (vision) {
          console.log('🔍 [AGENT-ENGINE-STREAM] Vision investigation details:', {
            id: vision.id,
            starshipId: vision.starshipId,
            statement: vision.statement,
            statementType: typeof vision.statement,
            statementTrimmed: vision.statement?.trim(),
            refinementCount: vision.refinementCount
          });
        }
        console.log('⚠️ [AGENT-ENGINE-STREAM] Proceeding without vision context - empty/null statement');
      }
    } else {
      console.error('❌ [AGENT-ENGINE-STREAM] CRITICAL: No starships found for user with any strategy');
      console.error('🔍 [AGENT-ENGINE-STREAM] Debug information:', {
        originalKindeId: req.user_id,
        resolvedInternalId: internalUserId,
        userResolutionSuccess: userResolutionSuccess,
        strategiesAttempted: starshipLookupStrategies,
        fallbackToKindeId: fallbackToKindeId
      });
      
      console.log('⚠️ [AGENT-ENGINE-STREAM] Proceeding without vision context - no starships found');
    }
  } catch (error) {
    console.error('❌ [AGENT-ENGINE-STREAM] Vision loading failed with critical error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      name: (error as Error).name,
      originalKindeId: req.user_id,
      resolvedInternalId: internalUserId
    });
    console.log('🔄 [AGENT-ENGINE-STREAM] Continuing without vision context due to critical error');
  }

  const sessionKey = store.makeKey(req.agent_id, req.user_id, req.channel_id);
  const memory = await store.get(sessionKey);
  console.log('🧠 [AGENT-ENGINE-STREAM] Memory loaded:', {
    sessionKey,
    memoryEntries: memory.length,
    recentEntries: memory.slice(-3).map((m) => `${m.role}: ${m.content.substring(0, 50)}...`),
  });

  let relevantContext = '';
  if (memory.length > 10) {
    const searchResult = await store.semanticSearch(sessionKey, req.message, 5);
    console.log('🔍 [AGENT-ENGINE-STREAM] Semantic search results:', {
      entriesFound: searchResult.entries.length,
      entries: searchResult.entries.map((e) => `${e.role}: ${e.content.substring(0, 50)}...`),
    });

    if (searchResult.entries.length > 0) {
      relevantContext = searchResult.entries
        .map((entry) => `${entry.role}: ${entry.content}`)
        .join('\n');
    }
  }

  console.log('📝 [AGENT-ENGINE-STREAM] Building prompt with:', {
    hasSystemPrompt: !!agent.systemPrompt,
    memoryEntries: memory.length,
    hasRelevantContext: !!relevantContext,
    hasVisionContext: !!visionContext,
    visionContextLength: visionContext.length,
    hasExpeditionContext: !!expeditionContext,
    expeditionContextLength: expeditionContext.length
  });

  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    visionContext,
    expeditionContext
  );

  console.log('✅ [AGENT-ENGINE-STREAM] Prompt built:', {
    totalMessages: prompt.messages.length,
    systemMessages: prompt.messages.filter((m) => m.role === 'system').length,
    userMessages: prompt.messages.filter((m) => m.role === 'user').length,
    assistantMessages: prompt.messages.filter((m) => m.role === 'assistant').length,
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
    maxTokens: llm?.maxTokens,
  });

  // Store user message before streaming
  console.log('💾 [AGENT-ENGINE-STREAM] Storing user message in memory...');
  const userTimestamp = Date.now();
  await store.append(sessionKey, {
    role: 'user',
    content: req.message,
    timestamp: userTimestamp,
  } as MemoryEntry);

  let fullResponse = '';
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
        elapsedTime: `${Date.now() - streamStartTime}ms`,
      });
    }

    yield chunk;
  }

  const streamEndTime = Date.now();
  console.log('✅ [AGENT-ENGINE-STREAM] Streaming completed:', {
    totalChunks: chunkCount,
    totalResponseLength: fullResponse.length,
    streamingTime: `${streamEndTime - streamStartTime}ms`,
    responsePreview: fullResponse.substring(0, 200) + '...',
  });

  // Store assistant message after streaming completes
  console.log('💾 [AGENT-ENGINE-STREAM] Storing assistant message in memory...');
  const assistantTimestamp = Date.now();
  await store.append(sessionKey, {
    role: 'assistant',
    content: fullResponse,
    timestamp: assistantTimestamp,
  } as MemoryEntry);

  console.log('🎉 [AGENT-ENGINE-STREAM] Streaming chat completed successfully');
}


export { LangChainMemoryStore, chatStream };

// Export First Officer Agent functionality
export * from './first-officer';
