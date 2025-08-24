import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory } from "@starships/models";
import type { ChatRequest, ChatResponse, MemoryEntry } from "@starships/protocol";

/**
 * Process chat request through agent with memory and context
 */
export async function chat(req: ChatRequest, store: LangChainMemoryStore): Promise<ChatResponse> {
  const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  console.log(`🚀 [AGENT-ENGINE][${requestId}] Starting chat request:`, {
    agent_id: req.agent_id,
    user_id: req.user_id,
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
    starshipId: agent.starshipId,
    systemPrompt: agent.systemPrompt?.substring(0, 100) + '...',
  });

  // If agent doesn't have a system prompt, create a default one based on their role
  if (!agent.systemPrompt || agent.systemPrompt.trim() === '') {
    agent.systemPrompt = `You are ${agent.name}, a specialized ${agent.category || 'general'} agent. 
Your role is to assist with tasks related to your expertise area.
You should be helpful, professional, and focused on delivering high-quality results within your domain of expertise.`;
    
    console.log('⚠️ [AGENT-ENGINE] Agent missing systemPrompt, using default:', {
      agentName: agent.name,
      category: agent.category,
      defaultPrompt: agent.systemPrompt.substring(0, 100) + '...'
    });
  }

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
  
  // Step 2: Load the agent's assigned starship for proper isolation
  try {
    console.log('🚢 [AGENT-ENGINE] Loading agent\'s assigned starship...');
    
    // CRITICAL FIX: Use the agent's starshipId to ensure proper isolation
    if (!agent.starshipId) {
      console.error('❌ [AGENT-ENGINE] Agent has no starshipId assigned:', agent.id);
      throw new Error(`Agent ${agent.id} has no starship assigned`);
    }
    
    console.log('🔍 [AGENT-ENGINE] Fetching starship with ID:', agent.starshipId);
    const activeStarship = await starshipRepo.findById(agent.starshipId);
    
    if (!activeStarship) {
      console.error('❌ [AGENT-ENGINE] Starship not found for agent:', {
        agentId: agent.id,
        starshipId: agent.starshipId
      });
      throw new Error(`Starship ${agent.starshipId} not found for agent ${agent.id}`);
    }
    
    console.log('✅ [AGENT-ENGINE] Agent\'s starship loaded:', {
      starshipId: activeStarship.id,
      starshipName: activeStarship.name,
      starshipClass: activeStarship.class,
      starshipStatus: activeStarship.status,
      ownerId: activeStarship.ownerId
    });
    
    // Verify the starship belongs to the user for security
    const isOwnerMatch = activeStarship.ownerId === internalUserId || 
                        activeStarship.ownerId === req.user_id;
    
    if (!isOwnerMatch) {
      console.error('❌ [AGENT-ENGINE] Starship ownership mismatch:', {
        starshipOwnerId: activeStarship.ownerId,
        internalUserId: internalUserId,
        kindeUserId: req.user_id
      });
      throw new Error('Agent\'s starship does not belong to the requesting user');
    }
    
    if (activeStarship) {
      console.log('🎯 [AGENT-ENGINE] Active starship selected:', {
        id: activeStarship.id,
        name: activeStarship.name,
        class: activeStarship.class,
        ownerId: activeStarship.ownerId,
        status: activeStarship.status,
        selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
      });
    // if (userStarships.length > 0) {
    //   // Check if we have a specific starship ID from the expedition context
    //   let activeStarship = null;
    //   const directStarshipStrategy = starshipLookupStrategies.find(s => s.startsWith('direct-starship:'));
      
    //   if (directStarshipStrategy) {
    //     // For expedition agents, use the specific starship from the expedition
    //     const expeditionStarshipId = directStarshipStrategy.split(':')[1];
    //     activeStarship = userStarships.find(s => s.id === expeditionStarshipId);
        
    //     if (activeStarship) {
    //       console.log('🎯 [AGENT-ENGINE] Using expedition-specific starship:', {
    //         id: activeStarship.id,
    //         name: activeStarship.name,
    //         expeditionStarshipId: expeditionStarshipId,
    //         selectionReason: 'expedition-context'
    //       });
    //     } else {
    //       console.log('⚠️ [AGENT-ENGINE] Expedition starship not found in user starships:', expeditionStarshipId);
    //     }
    //   }
      
    //   // Fall back to selecting the first active starship, or first starship if none are active
    //   if (!activeStarship) {
    //     activeStarship = userStarships.find(s => s.status === 'active') || userStarships[0];
    //     console.log('🎯 [AGENT-ENGINE] Active starship selected (fallback):', {
    //       id: activeStarship.id,
    //       name: activeStarship.name,
    //       class: activeStarship.class,
    //       ownerId: activeStarship.ownerId,
    //       status: activeStarship.status,
    //       selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
    //     });
    //   }
      
      // Step 3: Enhanced vision loading with validation
      console.log('🔍 [AGENT-ENGINE] Querying vision for starship ID:', activeStarship.id);
      const vision = await visionRepo.findByStarship(activeStarship.id);
      
      console.log('👁️ [AGENT-ENGINE] Vision database lookup result:', {
        visionFound: !!vision,
        visionId: vision?.id,
        starshipId: vision?.starshipId,
        hasStatement: !!vision?.statement,
        statementLength: vision?.statement?.length || 0,
        statementValue: vision?.statement || 'NULL/UNDEFINED',
        statementPreview: vision?.statement ? vision.statement.substring(0, 100) : 'NO_STATEMENT',
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
        
        visionContext = `\n\nCOMPANY/STARSHIP VISION:\n${vision.statement}\n\nIMPORTANT: This is YOUR company's vision. ALL work must align with this vision.\n\n⚠️ STRICT VISION ALIGNMENT POLICY:\n- You can ONLY work on missions that align with this vision\n- If a mission doesn't align with the vision, you MUST NOT proceed\n- Always check: "Does this mission support our vision of ${vision.statement}?"\n- If NO: Inform the user they have two options:\n  1. Adjust the mission to align with the current vision\n  2. Visit the Vision Chamber to update the company vision for strategic pivots\n- If YES: Proceed with enthusiasm while keeping the vision in mind\n\n💡 Remember: The Vision Chamber exists for strategic evolution. If the company is pivoting to new markets or products, the vision should be updated there first.\n`;
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
        console.log('⚠️ [AGENT-ENGINE] Proceeding without vision context - empty/null statement for starship:', activeStarship.id);
      }
    } else {
      console.error('❌ [AGENT-ENGINE] CRITICAL: Agent\'s starship could not be loaded');
      console.error('🔍 [AGENT-ENGINE] Debug information:', {
        agentId: agent.id,
        starshipId: agent.starshipId,
        originalKindeId: req.user_id,
        resolvedInternalId: internalUserId
      });
      
      console.log('⚠️ [AGENT-ENGINE] Proceeding without vision context - starship not accessible');
      // Try to load starship from agent's perspective (for crew agents)
      // console.log('🔍 [AGENT-ENGINE] Attempting to find starship from agent assignments...');
      // try {
      //   let agentStarship = null;
        
      //   // First, try to use starship slug from channel if available
      //   if (starshipSlugFromChannel) {
      //     console.log('🎯 [AGENT-ENGINE] Looking up starship by slug:', starshipSlugFromChannel);
      //     // For crew agents, we don't have the owner ID, so we need to find the starship differently
      //     // We can use findAll and filter by slug
      //     const allStarships = await starshipRepo.findAll();
      //     const starshipBySlug = allStarships.find(s => s.slug === starshipSlugFromChannel);
      //     if (starshipBySlug) {
      //       agentStarship = starshipBySlug;
      //       console.log('✅ [AGENT-ENGINE] Found starship by slug:', {
      //         id: starshipBySlug.id,
      //         name: starshipBySlug.name,
      //         slug: starshipSlugFromChannel
      //       });
      //     }
      //   }
        
      //   // Second, check if we have a starship ID from direct strategy or expedition
      //   if (!agentStarship) {
      //     console.log('🔍 [AGENT-ENGINE] Checking for starship strategies...');
      //     console.log('🔍 [AGENT-ENGINE] Available strategies:', starshipLookupStrategies);
          
      //     // Try direct starship ID first (from enhanced context)
      //     const directStarshipStrategy = starshipLookupStrategies.find(s => s.startsWith('direct-starship:'));
      //     if (directStarshipStrategy) {
      //       const starshipId = directStarshipStrategy.split(':')[1];
      //       console.log('🎯 [AGENT-ENGINE] Looking up starship from direct ID:', starshipId);
      //       const starshipById = await starshipRepo.findById(starshipId);
      //       if (starshipById) {
      //         agentStarship = starshipById;
      //         console.log('✅ [AGENT-ENGINE] Found starship from direct ID:', {
      //           id: starshipById.id,
      //           name: starshipById.name,
      //           fromDirect: true
      //         });
      //       } else {
      //         console.log('❌ [AGENT-ENGINE] Could not find starship with ID:', starshipId);
      //       }
      //     } else {
      //       console.log('⚠️ [AGENT-ENGINE] No direct-starship strategy found in:', starshipLookupStrategies);
      //     }
          
      //     // If not found, try expedition starship strategy
      //     if (!agentStarship) {
      //       const expeditionStarshipStrategy = starshipLookupStrategies.find(s => s.startsWith('expedition-starship:'));
      //       console.log('🔍 [AGENT-ENGINE] Expedition starship strategy:', expeditionStarshipStrategy);
      //       if (expeditionStarshipStrategy) {
      //       const starshipId = expeditionStarshipStrategy.split(':')[1];
      //       console.log('🎯 [AGENT-ENGINE] Looking up starship from expedition:', starshipId);
      //       const starshipById = await starshipRepo.findById(starshipId);
      //       if (starshipById) {
      //         agentStarship = starshipById;
      //         console.log('✅ [AGENT-ENGINE] Found starship from expedition:', {
      //           id: starshipById.id,
      //           name: starshipById.name,
      //           fromExpedition: true
      //         });
      //       }
      //     }
      //     }
      //   }
        
      //   // If no starship found by slug, try to find any active starship from remaining list
      //   if (!agentStarship && !starshipSlugFromChannel) {
      //     // We didn't look up by slug, so need to get all starships
      //     const allStarships = await starshipRepo.findAll();
          
      //     for (const starship of allStarships) {
      //       // Check if agent is part of this starship's crew
      //       // This would need to check the agent assignments
      //       // For now, we'll use the first starship if available
      //       if (starship.status === 'active') {
      //         agentStarship = starship;
      //         break;
      //       }
      //     }
          
      //     if (!agentStarship && allStarships.length > 0) {
      //       agentStarship = allStarships[0];
      //     }
      //   }
        
      //   if (agentStarship) {
      //     console.log('🎯 [AGENT-ENGINE] Found starship from agent perspective:', {
      //       id: agentStarship.id,
      //       name: agentStarship.name,
      //       status: agentStarship.status
      //     });
          
      //     // Load vision for this starship
      //     const vision = await visionRepo.findByStarship(agentStarship.id);
          
      //     if (vision?.statement && vision.statement.trim().length > 0) {
      //       console.log('📖 [AGENT-ENGINE] Vision loaded from agent starship:', {
      //         length: vision.statement.length,
      //         preview: vision.statement.substring(0, 150) + '...'
      //       });
            
      //       visionContext = `\n\nCOMPANY/STARSHIP VISION:\n${vision.statement}\n\nIMPORTANT: This is YOUR company's vision. ALL work must align with this vision.\n\n⚠️ STRICT VISION ALIGNMENT POLICY:\n- You can ONLY work on expeditions that align with this vision\n- If an expedition's mission doesn't align with the vision, you MUST NOT proceed\n- Always check: "Does this expedition support our vision of ${vision.statement}?"\n- If NO: Inform the user they have two options:\n  1. Adjust the expedition mission to align with the current vision\n  2. Visit the Vision Chamber to update the company vision for strategic pivots\n- If YES: Proceed with enthusiasm while keeping the vision in mind\n\n💡 Remember: The Vision Chamber exists for strategic evolution. If the company is pivoting to new markets or products, the vision should be updated there first.\n`;
      //       console.log('✅ [AGENT-ENGINE] Vision context prepared from agent starship');
      //     }
      //   } else {
      //     console.log('⚠️ [AGENT-ENGINE] No starships found even from agent perspective');
      //   }
      // } catch (fallbackError) {
      //   console.error('❌ [AGENT-ENGINE] Failed to load starship from agent perspective:', fallbackError);
      // }
      
      // // This could indicate a data inconsistency issue that needs to be addressed
      // console.log('⚠️ [AGENT-ENGINE] Proceeding without vision context - no starships found');
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

  const sessionKey = store.makeKey(req.agent_id, req.user_id);
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
    visionPreview: visionContext ? visionContext.substring(0, 100) + '...' : 'none',
    agentId: req.agent_id,
    agentName: agent.name
  });

  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    visionContext
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
    starshipId: agent.starshipId,
    systemPrompt: agent.systemPrompt?.substring(0, 100) + '...',
  });

  // If agent doesn't have a system prompt, create a default one based on their role
  if (!agent.systemPrompt || agent.systemPrompt.trim() === '') {
    agent.systemPrompt = `You are ${agent.name}, a specialized ${agent.category || 'general'} agent. 
Your role is to assist with tasks related to your expertise area.
You should be helpful, professional, and focused on delivering high-quality results within your domain of expertise.`;
    
    console.log('⚠️ [AGENT-ENGINE-STREAM] Agent missing systemPrompt, using default:', {
      agentName: agent.name,
      category: agent.category,
      defaultPrompt: agent.systemPrompt.substring(0, 100) + '...'
    });
  }

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
  
  // Step 2: Load the agent's assigned starship for proper isolation
  try {
    console.log('🚢 [AGENT-ENGINE-STREAM] Loading agent\'s assigned starship...');
    
    // CRITICAL FIX: Use the agent's starshipId to ensure proper isolation
    if (!agent.starshipId) {
      console.error('❌ [AGENT-ENGINE-STREAM] Agent has no starshipId assigned:', agent.id);
      throw new Error(`Agent ${agent.id} has no starship assigned`);
    }
    
    console.log('🔍 [AGENT-ENGINE-STREAM] Fetching starship with ID:', agent.starshipId);
    const activeStarship = await starshipRepo.findById(agent.starshipId);
    
    if (!activeStarship) {
      console.error('❌ [AGENT-ENGINE-STREAM] Starship not found for agent:', {
        agentId: agent.id,
        starshipId: agent.starshipId
      });
      throw new Error(`Starship ${agent.starshipId} not found for agent ${agent.id}`);
    }
    
    console.log('✅ [AGENT-ENGINE-STREAM] Agent\'s starship loaded:', {
      starshipId: activeStarship.id,
      starshipName: activeStarship.name,
      starshipClass: activeStarship.class,
      starshipStatus: activeStarship.status,
      ownerId: activeStarship.ownerId
    });
    
    // Verify the starship belongs to the user for security
    const isOwnerMatch = activeStarship.ownerId === internalUserId || 
                        activeStarship.ownerId === req.user_id;
    
    if (!isOwnerMatch) {
      console.error('❌ [AGENT-ENGINE-STREAM] Starship ownership mismatch:', {
        starshipOwnerId: activeStarship.ownerId,
        internalUserId: internalUserId,
        kindeUserId: req.user_id
      });
      throw new Error('Agent\'s starship does not belong to the requesting user');
    }
    
    if (activeStarship) {
      console.log('🎯 [AGENT-ENGINE-STREAM] Active starship selected:', {
        id: activeStarship.id,
        name: activeStarship.name,
        class: activeStarship.class,
        ownerId: activeStarship.ownerId,
        status: activeStarship.status,
        selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
      });
    // if (userStarships.length > 0) {
    //   // Check if we have a specific starship ID from the expedition context
    //   let activeStarship = null;
    //   const directStarshipStrategy = starshipLookupStrategies.find(s => s.startsWith('direct-starship:'));
      
    //   if (directStarshipStrategy) {
    //     // For expedition agents, use the specific starship from the expedition
    //     const expeditionStarshipId = directStarshipStrategy.split(':')[1];
    //     activeStarship = userStarships.find(s => s.id === expeditionStarshipId);
        
    //     if (activeStarship) {
    //       console.log('🎯 [AGENT-ENGINE-STREAM] Using expedition-specific starship:', {
    //         id: activeStarship.id,
    //         name: activeStarship.name,
    //         expeditionStarshipId: expeditionStarshipId,
    //         selectionReason: 'expedition-context'
    //       });
    //     } else {
    //       console.log('⚠️ [AGENT-ENGINE-STREAM] Expedition starship not found in user starships:', expeditionStarshipId);
    //     }
    //   }
      
    //   // Fall back to selecting the first active starship, or first starship if none are active
    //   if (!activeStarship) {
    //     activeStarship = userStarships.find(s => s.status === 'active') || userStarships[0];
    //     console.log('🎯 [AGENT-ENGINE-STREAM] Active starship selected (fallback):', {
    //       id: activeStarship.id,
    //       name: activeStarship.name,
    //       class: activeStarship.class,
    //       ownerId: activeStarship.ownerId,
    //       status: activeStarship.status,
    //       selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
    //     });
    //   }
      
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
        
        visionContext = `\n\nCOMPANY/STARSHIP VISION:\n${vision.statement}\n\nIMPORTANT: This is YOUR company's vision. ALL work must align with this vision.\n\n⚠️ STRICT VISION ALIGNMENT POLICY:\n- You can ONLY work on missions that align with this vision\n- If a mission doesn't align with the vision, you MUST NOT proceed\n- Always check: "Does this mission support our vision of ${vision.statement}?"\n- If NO: Inform the user they have two options:\n  1. Adjust the mission to align with the current vision\n  2. Visit the Vision Chamber to update the company vision for strategic pivots\n- If YES: Proceed with enthusiasm while keeping the vision in mind\n\n💡 Remember: The Vision Chamber exists for strategic evolution. If the company is pivoting to new markets or products, the vision should be updated there first.\n`;
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
      console.error('❌ [AGENT-ENGINE-STREAM] CRITICAL: Agent\'s starship could not be loaded');
      console.error('🔍 [AGENT-ENGINE-STREAM] Debug information:', {
        agentId: agent.id,
        starshipId: agent.starshipId,
        originalKindeId: req.user_id,
        resolvedInternalId: internalUserId
      });
      
      console.log('⚠️ [AGENT-ENGINE-STREAM] Proceeding without vision context - starship not accessible');
      
      /* COMMENTED OUT: Complex fallback logic for loading starship from agent's perspective
       * This was causing issues and is being kept for reference if needed later
       * 
      // Try to load starship from agent's perspective (for crew agents)
      console.log('🔍 [AGENT-ENGINE-STREAM] Attempting to find starship from agent assignments...');
      try {
        let agentStarship = null;
        
        // First, try to use starship slug from channel if available
        if (starshipSlugFromChannel) {
          console.log('🎯 [AGENT-ENGINE-STREAM] Looking up starship by slug:', starshipSlugFromChannel);
          // For crew agents, we don't have the owner ID, so we need to find the starship differently
          // We can use findAll and filter by slug
          const allStarships = await starshipRepo.findAll();
          const starshipBySlug = allStarships.find(s => s.slug === starshipSlugFromChannel);
          if (starshipBySlug) {
            agentStarship = starshipBySlug;
            console.log('✅ [AGENT-ENGINE-STREAM] Found starship by slug:', {
              id: starshipBySlug.id,
              name: starshipBySlug.name,
              slug: starshipSlugFromChannel
            });
          }
        }
        
        // Second, check if we have a starship ID from direct strategy or expedition
        if (!agentStarship) {
          console.log('🔍 [AGENT-ENGINE] Checking for starship strategies...');
          console.log('🔍 [AGENT-ENGINE] Available strategies:', starshipLookupStrategies);
          
          // Try direct starship ID first (from enhanced context)
          const directStarshipStrategy = starshipLookupStrategies.find(s => s.startsWith('direct-starship:'));
          if (directStarshipStrategy) {
            const starshipId = directStarshipStrategy.split(':')[1];
            console.log('🎯 [AGENT-ENGINE] Looking up starship from direct ID:', starshipId);
            const starshipById = await starshipRepo.findById(starshipId);
            if (starshipById) {
              agentStarship = starshipById;
              console.log('✅ [AGENT-ENGINE] Found starship from direct ID:', {
                id: starshipById.id,
                name: starshipById.name,
                fromDirect: true
              });
            } else {
              console.log('❌ [AGENT-ENGINE] Could not find starship with ID:', starshipId);
            }
          } else {
            console.log('⚠️ [AGENT-ENGINE] No direct-starship strategy found in:', starshipLookupStrategies);
          }
          
          // If not found, try expedition starship strategy
          if (!agentStarship) {
            const expeditionStarshipStrategy = starshipLookupStrategies.find(s => s.startsWith('expedition-starship:'));
            console.log('🔍 [AGENT-ENGINE] Expedition starship strategy:', expeditionStarshipStrategy);
            if (expeditionStarshipStrategy) {
            const starshipId = expeditionStarshipStrategy.split(':')[1];
            console.log('🎯 [AGENT-ENGINE-STREAM] Looking up starship from expedition:', starshipId);
            const starshipById = await starshipRepo.findById(starshipId);
            if (starshipById) {
              agentStarship = starshipById;
              console.log('✅ [AGENT-ENGINE-STREAM] Found starship from expedition:', {
                id: starshipById.id,
                name: starshipById.name,
                fromExpedition: true
              });
            }
          }
          }
        }
        
        // If no starship found by slug, try to find any active starship from remaining list
        if (!agentStarship && !starshipSlugFromChannel) {
          // We didn't look up by slug, so need to get all starships
          const allStarships = await starshipRepo.findAll();
          
          for (const starship of allStarships) {
            // Check if agent is part of this starship's crew
            // This would need to check the agent assignments
            // For now, we'll use the first starship if available
            if (starship.status === 'active') {
              agentStarship = starship;
              break;
            }
          }
          
          if (!agentStarship && allStarships.length > 0) {
            agentStarship = allStarships[0];
          }
        }
        
        if (agentStarship) {
          console.log('🎯 [AGENT-ENGINE-STREAM] Found starship from agent perspective:', {
            id: agentStarship.id,
            name: agentStarship.name,
            status: agentStarship.status
          });
          
          // Load vision for this starship
          const vision = await visionRepo.findByStarship(agentStarship.id);
          
          if (vision?.statement && vision.statement.trim().length > 0) {
            console.log('📖 [AGENT-ENGINE-STREAM] Vision loaded from agent starship:', {
              length: vision.statement.length,
              preview: vision.statement.substring(0, 150) + '...'
            });
            
            visionContext = `\n\nCOMPANY/STARSHIP VISION:\n${vision.statement}\n\nIMPORTANT: This is YOUR company's vision. ALL work must align with this vision.\n\n⚠️ STRICT VISION ALIGNMENT POLICY:\n- You can ONLY work on missions that align with this vision\n- If a mission doesn't align with the vision, you MUST NOT proceed\n- Always check: "Does this mission support our vision of ${vision.statement}?"\n- If NO: Inform the user they have two options:\n  1. Adjust the mission to align with the current vision\n  2. Visit the Vision Chamber to update the company vision for strategic pivots\n- If YES: Proceed with enthusiasm while keeping the vision in mind\n\n💡 Remember: The Vision Chamber exists for strategic evolution. If the company is pivoting to new markets or products, the vision should be updated there first.\n`;
            console.log('✅ [AGENT-ENGINE-STREAM] Vision context prepared from agent starship');
          }
        } else {
          console.log('⚠️ [AGENT-ENGINE-STREAM] No starships found even from agent perspective');
        }
      } catch (fallbackError) {
        console.error('❌ [AGENT-ENGINE-STREAM] Failed to load starship from agent perspective:', fallbackError);
      }
      
      console.log('⚠️ [AGENT-ENGINE-STREAM] Proceeding without vision context - no starships found');
      */
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

  const sessionKey = store.makeKey(req.agent_id, req.user_id);
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
    visionContextLength: visionContext.length
  });

  const prompt = buildPrompt(
    agent.systemPrompt,
    memory,
    req.message,
    relevantContext,
    visionContext
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
export { chatWithMCP as chatWithNativeTools } from './chat-with-mcp';
export { chatWithMCPStream as chatWithNativeToolsStream } from './chat-with-mcp-stream';

// Export LLM Provider Factory and LangChainProvider
export { ProviderFactory } from './llm/provider-factory';
export { LangChainProvider } from './llm/langchain-provider';

// Export native tool wrapper
export { MCPToolWrapper as NativeToolWrapper, NativeToolConfig } from './tools/MCPToolWrapper';

