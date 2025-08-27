import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory } from "@starships/models";
import { NativeToolWrapper } from "./tools/NativeToolWrapper";
import type { ChatRequest, ChatResponse, MemoryEntry } from "@starships/protocol";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { createToolCallingAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

/**
 * Enhanced chat function with native tool integration
 */
export async function chat(
  req: ChatRequest,
  store: LangChainMemoryStore,
  options?: { overrideStarshipId?: string }
): Promise<ChatResponse> {
  // Validate that agent_id is provided for agent chat
  if (!req.agent_id) {
    throw new Error('agent_id is required for agent chat');
  }

  console.log('🚀 [AGENT-ENGINE] Starting chat request:', {
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

  // ENHANCED USER ID RESOLUTION WITH COMPREHENSIVE FALLBACK STRATEGIES
  console.log('🔍 [AGENT-ENGINE] Starting enhanced vision context loading...');
  console.log('👤 [AGENT-ENGINE] Original Kinde user ID:', req.user_id);
  
  // Step 1: Attempt to resolve internal user ID from Kinde user ID
  let internalUserId = req.user_id;
  // let userResolutionSuccess = false;
  // let fallbackToKindeId = false;
  
  try {
    console.log('🔍 [AGENT-ENGINE] Attempting to resolve internal user from Kinde ID...');
    const user = await userRepo.findByKindeId(req.user_id);
    if (user) {
      internalUserId = user.id;
      // userResolutionSuccess = true;
      console.log('✅ [AGENT-ENGINE] Internal user found successfully:', {
        internalUserId: internalUserId,
        username: user.username,
        email: user.email,
        kindeId: user.kindeId
      });
    } else {
      console.warn('⚠️ [AGENT-ENGINE] No internal user found for Kinde ID');
      console.log('🔄 [AGENT-ENGINE] Will attempt starship lookup with Kinde ID as fallback');
      // fallbackToKindeId = true;
    }
  } catch (userError) {
    console.error('❌ [AGENT-ENGINE] Error during user ID resolution:', {
      error: (userError as Error).message,
      stack: (userError as Error).stack
    });
    console.log('🔄 [AGENT-ENGINE] Will attempt starship lookup with Kinde ID as fallback');
    // fallbackToKindeId = true;
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
    
    // For temporary users, skip ownership check but log a warning
    const isTemporaryUser = req.user_id.startsWith('temp:');
    
    if (!isOwnerMatch && !isTemporaryUser) {
      console.error('❌ [AGENT-ENGINE] Starship ownership mismatch:', {
        starshipOwnerId: activeStarship.ownerId,
        internalUserId: internalUserId,
        kindeUserId: req.user_id
      });
      throw new Error('Agent\'s starship does not belong to the requesting user');
    } else if (!isOwnerMatch && isTemporaryUser) {
      console.warn('⚠️ [AGENT-ENGINE] Skipping ownership check for temporary user:', {
        starshipOwnerId: activeStarship.ownerId,
        tempUserId: req.user_id,
        reason: 'Temporary user IDs cannot be resolved to internal IDs'
      });
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

  // Initialize native tools for the agent's starship
  let nativeTools: any[] = [];
  let starshipId: string | null = null;
  
  try {
    // Use override starshipId if provided, otherwise use agent's starshipId
    const effectiveStarshipId = options?.overrideStarshipId || agent.starshipId;
    console.log('🔍 [AGENT-ENGINE] Looking for agent starship. Agent starshipId:', agent.starshipId);
    console.log('🔍 [AGENT-ENGINE] Override starshipId:', options?.overrideStarshipId);
    console.log('🔍 [AGENT-ENGINE] Effective starshipId:', effectiveStarshipId);
    console.log('🔍 [AGENT-ENGINE] Agent name:', agent.name);
    console.log('🔍 [AGENT-ENGINE] Request details:', { agent_id: req.agent_id, message: req.message.substring(0, 100) });
    
    if (agent && effectiveStarshipId) {
      starshipId = effectiveStarshipId;
      console.log('🚢 [AGENT-ENGINE] Using starship for native tools:', starshipId);
      
      // Create native tool wrapper
      const toolWrapper = new NativeToolWrapper({
        starshipId: starshipId!,
        agentId: req.agent_id!,
        enableLogging: true
      });
      
      // Get available native tools
      console.log('🔧 [AGENT-ENGINE] Attempting to create native tools...');
      nativeTools = await toolWrapper.createAllTools();
      console.log(`🔧 [AGENT-ENGINE] Loaded ${nativeTools.length} native tools`);
      if (nativeTools.length > 0) {
        console.log('📋 [AGENT-ENGINE] Available tools:', nativeTools.map(t => ({ name: t.name, description: t.description })));
      }
    } else {
      console.log('⚠️ [AGENT-ENGINE] No starshipId found for agent');
    }
  } catch (error) {
    console.warn('⚠️ [AGENT-ENGINE] Could not load native tools:', error);
  }

  // Get conversation history
  const memoryKey = store.makeKey(req.agent_id!, req.user_id);
  const memories = await store.get(memoryKey);
  const memoryArray = memories.slice(-10); // Get last 10 messages
  
  // Add system prompt with tool context
  let systemPrompt = agent.systemPrompt || "You are a helpful AI assistant.";
  
  if (nativeTools.length > 0) {
    systemPrompt += `\n\nYou have access to the following tools that you can use to help the user:
${nativeTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

🔧 TOOL USAGE BEST PRACTICES:
- When using web search tools, keep queries SIMPLE and FOCUSED
- Use ONE tool call at a time instead of multiple simultaneous requests
- For web searches, use clear, specific keywords (e.g., "best food delivery apps 2024")
- Avoid overly complex or multi-part queries that may timeout
- If you need comprehensive information, make multiple simple searches instead of one complex query

When appropriate, use these tools to provide better assistance.`;
  }
  
  systemPrompt += visionContext;
  
  // Add dynamic tool usage guidance based on available tools
  if (nativeTools.length > 0) {
    const hasNotionTools = nativeTools.some(t => t.name.includes('notion'));
    const blockRetrievalTool = nativeTools.find(t => 
      t.name.toLowerCase().includes('block') || 
      t.name.toLowerCase().includes('children')
    );
    
    if (hasNotionTools && blockRetrievalTool) {
      systemPrompt += `\n\nCRITICAL TOOL SELECTION GUIDANCE:
When users ask about page content using words like "stored", "inside", "text", "information", "content":
- DO NOT use 'API-retrieve-a-page' - it only returns metadata
- USE '${blockRetrievalTool.name}' to get actual page content
- If first attempt returns no content, always try the block/children retrieval tool\n`;
    }
  }
  
  // Escape curly braces to prevent LangChain template parsing errors
  systemPrompt = systemPrompt.replace(/\{/g, '{{').replace(/\}/g, '}}');
  
  // If we have native tools, use an agent executor
  if (nativeTools.length > 0) {
    console.log('🤖 [AGENT-ENGINE] Creating agent executor with native tools');
    
    // Create the LLM instance
    // Try to find by ID first, then by name if it looks like a model name
    let llmModel = await llmRepo.findById(agent.model);
    
    // If not found and doesn't look like a UUID, try finding by name
    if (!llmModel && !agent.model.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.log(`🔍 [AGENT-ENGINE] Model ID "${agent.model}" not found, searching by name...`);
      const allModels = await llmRepo.findAll();
      llmModel = allModels.find((m: any) => m.name === agent.model || m.id === agent.model) || null;
    }
    
    if (!llmModel) {
      throw new Error(`LLM model ${agent.model} not found`);
    }
    
    const llm = llmModel.provider === 'openai' 
      ? new ChatOpenAI({
          model: llmModel.name,
          temperature: llmModel.temperature,
          apiKey: process.env.OPENAI_API_KEY,
        })
      : new ChatAnthropic({
          model: llmModel.name,
          temperature: llmModel.temperature,
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
    
    // Create the prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);
    
    // Create the agent - use tool calling agent for all providers
    const agentExecutor = await createToolCallingAgent({
      llm,
      tools: nativeTools,
      prompt,
    });
    
    // Create standard executor
    const executor = new AgentExecutor({
      agent: agentExecutor,
      tools: nativeTools,
      verbose: true,
      maxIterations: 10,
      returnIntermediateSteps: true,
      handleParsingErrors: true,
      earlyStoppingMethod: "force",
    });
    
    // Format chat history
    const chatHistory = memoryArray.map((m: any) => 
      m.role === 'user' 
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    );
    
    // Execute with tools
    const result = await executor.invoke({
      input: req.message,
      chat_history: chatHistory,
    });
    
    // Store the interaction in memory
    await store.append(memoryKey, {
      role: 'user',
      content: req.message,
      timestamp: Date.now()
    } as MemoryEntry);
    
    await store.append(memoryKey, {
      role: 'assistant',
      content: result.output,
      timestamp: Date.now()
    } as MemoryEntry);
    
    return {
      source: 'agent',
      content: result.output,
      agent_id: req.agent_id,
      usage: undefined, // Agent executor doesn't provide token usage
    };
  } else {
    // Fall back to regular chat without tools
    console.log('📝 [AGENT-ENGINE] No native tools available, using regular chat');
    
    // Build the prompt
    // Memories are already in the expected format
    const formattedMemories = memoryArray;
    
    const prompt = buildPrompt(
      systemPrompt,
      formattedMemories,
      req.message
    );

    // Get LLM provider
    const provider = await ProviderFactory.getProvider(req.agent_id!);

    // Execute completion
    // Try to find by ID first, then by name if it looks like a model name
    let llmModel = await llmRepo.findById(agent.model);
    
    // If not found and doesn't look like a UUID, try finding by name
    if (!llmModel && !agent.model.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.log(`🔍 [AGENT-ENGINE] Model ID "${agent.model}" not found, searching by name...`);
      const allModels = await llmRepo.findAll();
      llmModel = allModels.find((m: any) => m.name === agent.model || m.id === agent.model) || null;
    }
    
    const result = await provider.complete(prompt, { temperature: llmModel?.temperature });

    // Store the interaction in memory
    await store.append(memoryKey, {
      role: 'user',
      content: req.message,
      timestamp: Date.now()
    } as MemoryEntry);
    
    await store.append(memoryKey, {
      role: 'assistant',
      content: result.reply,
      timestamp: Date.now()
    } as MemoryEntry);

    console.log('✅ [AGENT-ENGINE] Chat completed successfully');

    return {
      source: 'agent',
      content: result.reply,
      agent_id: req.agent_id,
      usage: result.usage
    };
  }
}

// Keep the old function name for backward compatibility during migration
export async function chatWithMCP(
  req: ChatRequest, 
  store: LangChainMemoryStore, 
  options?: { overrideStarshipId?: string }
): Promise<ChatResponse> {
  return chat(req, store, options);
}