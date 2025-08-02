import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory, AgentExpeditionContextService } from "@starships/models";
import { MCPToolWrapper } from "./tools/MCPToolWrapper";
import { mcpToolGatewayDB } from "@starships/core";
import type { ChatRequest, ChatResponse, MemoryEntry } from "@starships/protocol";
import { AgentExecutor } from "langchain/agents";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { createOpenAIFunctionsAgent, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

/**
 * Enhanced chat function with MCP tool integration
 */
export async function chatWithMCP(
  req: ChatRequest, 
  store: LangChainMemoryStore, 
  options?: { overrideStarshipId?: string }
): Promise<ChatResponse> {
  console.log('🚀 [AGENT-ENGINE-MCP] Starting MCP-enhanced chat request:', {
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
    console.error('❌ [AGENT-ENGINE-MCP] Agent not found:', req.agent_id);
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  console.log('✅ [AGENT-ENGINE-MCP] Agent found:', {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    starshipId: agent.starshipId,
    systemPrompt: agent.systemPrompt?.substring(0, 100) + '...',
  });

  // ENHANCED USER ID RESOLUTION WITH COMPREHENSIVE FALLBACK STRATEGIES
  console.log('🔍 [AGENT-ENGINE-MCP] Starting enhanced vision context loading...');
  console.log('👤 [AGENT-ENGINE-MCP] Original Kinde user ID:', req.user_id);
  
  // Step 1: Attempt to resolve internal user ID from Kinde user ID
  let internalUserId = req.user_id;
  let userResolutionSuccess = false;
  let fallbackToKindeId = false;
  
  try {
    console.log('🔍 [AGENT-ENGINE-MCP] Attempting to resolve internal user from Kinde ID...');
    const user = await userRepo.findByKindeId(req.user_id);
    if (user) {
      internalUserId = user.id;
      userResolutionSuccess = true;
      console.log('✅ [AGENT-ENGINE-MCP] Internal user found successfully:', {
        internalUserId: internalUserId,
        username: user.username,
        email: user.email,
        kindeId: user.kindeId
      });
    } else {
      console.warn('⚠️ [AGENT-ENGINE-MCP] No internal user found for Kinde ID');
      console.log('🔄 [AGENT-ENGINE-MCP] Will attempt starship lookup with Kinde ID as fallback');
      fallbackToKindeId = true;
    }
  } catch (userError) {
    console.error('❌ [AGENT-ENGINE-MCP] Error during user ID resolution:', {
      error: (userError as Error).message,
      stack: (userError as Error).stack
    });
    console.log('🔄 [AGENT-ENGINE-MCP] Will attempt starship lookup with Kinde ID as fallback');
    fallbackToKindeId = true;
  }
  
  let visionContext = "";
  let expeditionContext = "";
  let starshipLookupStrategies: string[] = [];
  let starshipSlugFromChannel: string | null = null;
  
  // Load expedition context for agent awareness
  try {
    // Check if channel_id contains expedition ID or starship ID
    let expeditionIdFromChannel: string | null = null;
    
    if (req.channel_id) {
      if (req.channel_id.startsWith('expedition-') || req.channel_id.startsWith('expedition:')) {
        // Handle multiple formats: 
        // - expedition-{expeditionId} (old format with dash)
        // - expedition:{expeditionId}:starship:{starshipId} (new format with colons)
        
        if (req.channel_id.includes(':')) {
          // New format with colons
          const parts = req.channel_id.split(':');
          if (parts.length >= 2) {
            expeditionIdFromChannel = parts[1];
            console.log('🔍 [AGENT-ENGINE-MCP] Extracted expedition ID from channel:', expeditionIdFromChannel);
            
            // Check if starship ID is also included
            if (parts.length >= 4 && parts[2] === 'starship') {
              const starshipId = parts[3];
              console.log('🔍 [AGENT-ENGINE-MCP] Found starship ID in channel:', starshipId);
              // Add it to lookup strategies for direct use
              starshipLookupStrategies.push(`direct-starship:${starshipId}`);
            }
          }
        } else {
          // Old format with dashes
          const parts = req.channel_id.split('-');
          if (parts.length >= 2) {
            expeditionIdFromChannel = parts[1];
            console.log('🔍 [AGENT-ENGINE-MCP] Extracted expedition ID from channel (old format):', expeditionIdFromChannel);
          }
        }
      } else if (req.channel_id.startsWith('starship-')) {
        // Extract starship slug from channel_id format: starship-SLUG:agent-AGENTID:user-USERID
        const colonIndex = req.channel_id.indexOf(':');
        if (colonIndex > 0) {
          starshipSlugFromChannel = req.channel_id.substring(9, colonIndex); // 'starship-'.length = 9
          console.log('🔍 [AGENT-ENGINE-MCP] Extracted starship slug from channel:', starshipSlugFromChannel);
        }
      }
    }

    const contextService = AgentExpeditionContextService.getInstance();
    expeditionContext = await contextService.getAgentExpeditionContext(req.agent_id);
    
    if (expeditionContext) {
      console.log('🚢 [AGENT-ENGINE-MCP] Expedition context loaded for agent:', {
        agentId: req.agent_id,
        contextLength: expeditionContext.length,
        hasExpedition: true
      });
    }

    // If we found an expedition ID in the channel but no expedition context, add basic context
    if (expeditionIdFromChannel && !expeditionContext) {
      console.log('🔍 [AGENT-ENGINE-MCP] Adding basic expedition context for ID:', expeditionIdFromChannel);
      expeditionContext = `\n\nCURRENT EXPEDITION CONTEXT:\nYou are currently participating in expedition ${expeditionIdFromChannel}. Coordinate with other agents and the First Officer to complete the mission objectives.

🔍 WEB SEARCH GUIDANCE FOR EXPEDITIONS:
- When you need current information, market data, or external research, use web search tools
- Keep search queries SIMPLE and FOCUSED (e.g., "best food delivery apps 2024" instead of complex multi-part queries)  
- Use ONE search query at a time instead of multiple bulk requests
- Start with broad searches, then narrow down based on results
- For complex research, break it into multiple simple searches rather than one complex query

Example good search patterns:
✅ "food delivery market size 2024"
✅ "top food delivery apps comparison"
✅ "food delivery trends 2024"

Avoid complex queries like:
❌ "comprehensive analysis of food delivery market including market size, growth trends, competitor analysis, customer preferences, and future projections for 2024-2025"
\n`;
      
      // Also try to get the starship from the expedition
      try {
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionIdFromChannel);
        if (expedition && expedition.starshipId) {
          console.log('🔍 [AGENT-ENGINE-MCP] Found starship ID from expedition:', expedition.starshipId);
          // We'll use this later for vision loading if user starships aren't found
          starshipLookupStrategies.push(`expedition-starship:${expedition.starshipId}`);
        } else {
          console.log('⚠️ [AGENT-ENGINE-MCP] Expedition found but no starshipId:', {
            expeditionId: expeditionIdFromChannel,
            expeditionFound: !!expedition,
            starshipId: expedition?.starshipId
          });
        }
      } catch (expError) {
        console.log('⚠️ [AGENT-ENGINE-MCP] Could not load expedition details:', expError);
      }
    }
  } catch (contextError) {
    console.log('⚠️ [AGENT-ENGINE-MCP] Could not load expedition context:', contextError);
    // Continue without expedition context
  }
  
  // Step 2: Load the agent's assigned starship for proper isolation
  try {
    console.log('🚢 [AGENT-ENGINE-MCP] Loading agent\'s assigned starship...');
    
    // CRITICAL FIX: Use the agent's starshipId to ensure proper isolation
    if (!agent.starshipId) {
      console.error('❌ [AGENT-ENGINE-MCP] Agent has no starshipId assigned:', agent.id);
      throw new Error(`Agent ${agent.id} has no starship assigned`);
    }
    
    console.log('🔍 [AGENT-ENGINE-MCP] Fetching starship with ID:', agent.starshipId);
    const activeStarship = await starshipRepo.findById(agent.starshipId);
    
    if (!activeStarship) {
      console.error('❌ [AGENT-ENGINE-MCP] Starship not found for agent:', {
        agentId: agent.id,
        starshipId: agent.starshipId
      });
      throw new Error(`Starship ${agent.starshipId} not found for agent ${agent.id}`);
    }
    
    console.log('✅ [AGENT-ENGINE-MCP] Agent\'s starship loaded:', {
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
      console.error('❌ [AGENT-ENGINE-MCP] Starship ownership mismatch:', {
        starshipOwnerId: activeStarship.ownerId,
        internalUserId: internalUserId,
        kindeUserId: req.user_id
      });
      throw new Error('Agent\'s starship does not belong to the requesting user');
    }
    
    if (activeStarship) {
      console.log('🎯 [AGENT-ENGINE-MCP] Active starship selected:', {
        id: activeStarship.id,
        name: activeStarship.name,
        class: activeStarship.class,
        ownerId: activeStarship.ownerId,
        status: activeStarship.status,
        selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
      });
      
      // Step 3: Enhanced vision loading with validation
      console.log('🔍 [AGENT-ENGINE-MCP] Querying vision for starship ID:', activeStarship.id);
      const vision = await visionRepo.findByStarship(activeStarship.id);
      
      console.log('👁️ [AGENT-ENGINE-MCP] Vision database lookup result:', {
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
        console.log('📖 [AGENT-ENGINE-MCP] Vision loaded successfully from database:', {
          length: vision.statement.length,
          preview: vision.statement.substring(0, 150) + '...',
          refinementCount: vision.refinementCount || 0,
          lastRefined: vision.lastRefined
        });
        
        visionContext = `\n\nCOMPANY/STARSHIP VISION:\n${vision.statement}\n\nIMPORTANT: This is YOUR company's vision. ALL work must align with this vision.\n\n⚠️ STRICT VISION ALIGNMENT POLICY:\n- You can ONLY work on expeditions that align with this vision\n- If an expedition's mission doesn't align with the vision, you MUST NOT proceed\n- Always check: "Does this expedition support our vision of ${vision.statement}?"\n- If NO: Inform the user they have two options:\n  1. Adjust the expedition mission to align with the current vision\n  2. Visit the Vision Chamber to update the company vision for strategic pivots\n- If YES: Proceed with enthusiasm while keeping the vision in mind\n\n💡 Remember: The Vision Chamber exists for strategic evolution. If the company is pivoting to new markets or products, the vision should be updated there first.\n`;
        console.log('✅ [AGENT-ENGINE-MCP] Vision context prepared successfully, length:', visionContext.length);
      } else {
        console.log('📝 [AGENT-ENGINE-MCP] Vision exists but has no usable statement');
        if (vision) {
          console.log('🔍 [AGENT-ENGINE-MCP] Vision investigation details:', {
            id: vision.id,
            starshipId: vision.starshipId,
            statement: vision.statement,
            statementType: typeof vision.statement,
            statementTrimmed: vision.statement?.trim(),
            refinementCount: vision.refinementCount
          });
        }
        console.log('⚠️ [AGENT-ENGINE-MCP] Proceeding without vision context - empty/null statement for starship:', activeStarship.id);
      }
    } else {
      console.error('❌ [AGENT-ENGINE-MCP] CRITICAL: Agent\'s starship could not be loaded');
      console.error('🔍 [AGENT-ENGINE-MCP] Debug information:', {
        agentId: agent.id,
        starshipId: agent.starshipId,
        originalKindeId: req.user_id,
        resolvedInternalId: internalUserId
      });
      
      console.log('⚠️ [AGENT-ENGINE-MCP] Proceeding without vision context - starship not accessible');
    }
  } catch (error) {
    console.error('❌ [AGENT-ENGINE-MCP] Vision loading failed with critical error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      name: (error as Error).name,
      originalKindeId: req.user_id,
      resolvedInternalId: internalUserId
    });
    // Don't block agent - continue without vision context
    console.log('🔄 [AGENT-ENGINE-MCP] Continuing without vision context due to critical error');
  }

  // Initialize MCP tools for the agent's starship
  let mcpTools: any[] = [];
  let starshipId: string | null = null;
  
  try {
    // Use override starshipId if provided, otherwise use agent's starshipId
    const effectiveStarshipId = options?.overrideStarshipId || agent.starshipId;
    console.log('🔍 [AGENT-ENGINE-MCP] Looking for agent starship. Agent starshipId:', agent.starshipId);
    console.log('🔍 [AGENT-ENGINE-MCP] Override starshipId:', options?.overrideStarshipId);
    console.log('🔍 [AGENT-ENGINE-MCP] Effective starshipId:', effectiveStarshipId);
    console.log('🔍 [AGENT-ENGINE-MCP] Agent name:', agent.name);
    console.log('🔍 [AGENT-ENGINE-MCP] Request details:', { agent_id: req.agent_id, message: req.message.substring(0, 100) });
    
    if (agent && effectiveStarshipId) {
      starshipId = effectiveStarshipId;
      console.log('🚢 [AGENT-ENGINE-MCP] Using starship for MCP tools:', starshipId);
      
      // Create MCP tool wrapper
      const toolWrapper = new MCPToolWrapper({
        starshipId: starshipId!,
        agentId: req.agent_id,
        gateway: mcpToolGatewayDB,
        enableLogging: true
      });
      
      // Get available MCP tools
      console.log('🔧 [AGENT-ENGINE-MCP] Attempting to create MCP tools...');
      mcpTools = await toolWrapper.createAllTools();
      console.log(`🔧 [AGENT-ENGINE-MCP] Loaded ${mcpTools.length} MCP tools`);
      if (mcpTools.length > 0) {
        console.log('📋 [AGENT-ENGINE-MCP] Available tools:', mcpTools.map(t => ({ name: t.name, description: t.description })));
      }
    } else {
      console.log('⚠️ [AGENT-ENGINE-MCP] No starshipId found for agent');
    }
  } catch (error) {
    console.warn('⚠️ [AGENT-ENGINE-MCP] Could not load MCP tools:', error);
  }

  // Get conversation history
  const sessionKey = { channel_id: req.channel_id, agent_id: req.agent_id };
  const memoryKey = store.makeKey(req.agent_id, req.user_id, req.channel_id);
  const memories = await store.get(memoryKey);
  const memoryArray = memories.slice(-10); // Get last 10 messages
  
  // Build messages for the LLM
  const messages = [];
  
  // Add system prompt with MCP context
  let systemPrompt = agent.systemPrompt || "You are a helpful AI assistant.";
  
  // For expedition agents, emphasize web search capabilities
  if (req.channel_id?.includes('expedition')) {
    systemPrompt += `\n\n🔍 WEB RESEARCH CAPABILITIES:
You have access to web search tools that allow you to gather current information, research trends, and find real-time data. When users ask for information that requires current knowledge:

1. Use web search tools to gather current information
2. Search for specific data points, reports, and insights
3. Combine web research with your expertise
4. Provide informed responses based on current information

Don't limit yourself to historical knowledge - actively use web search to provide the most current and relevant information.`;
  }
  if (mcpTools.length > 0) {
    systemPrompt += `\n\nYou have access to the following MCP (Model Context Protocol) tools that you can use to help the user:
${mcpTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

🔧 TOOL USAGE BEST PRACTICES:
- When using web search tools, keep queries SIMPLE and FOCUSED
- Use ONE tool call at a time instead of multiple simultaneous requests
- For web searches, use clear, specific keywords (e.g., "best food delivery apps 2024")
- Avoid overly complex or multi-part queries that may timeout
- If you need comprehensive information, make multiple simple searches instead of one complex query

When appropriate, use these tools to provide better assistance. You are connected to MCP servers that provide these capabilities.`;
  }
  
  systemPrompt += visionContext;
  systemPrompt += expeditionContext;
  
  // Escape curly braces to prevent LangChain template parsing errors
  systemPrompt = systemPrompt.replace(/\{/g, '{{').replace(/\}/g, '}}');
  
  // If we have MCP tools, use an agent executor
  if (mcpTools.length > 0) {
    console.log('🤖 [AGENT-ENGINE-MCP] Creating agent executor with MCP tools');
    
    // Create the LLM instance
    const llmModel = await llmRepo.findById(agent.model);
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
    // The OpenAIFunctionsAgent seems to have issues with returning empty output
    const agentExecutor = await createToolCallingAgent({
      llm,
      tools: mcpTools,
      prompt,
    });
    
    // Create the executor
    const executor = new AgentExecutor({
      agent: agentExecutor,
      tools: mcpTools,
      verbose: true,
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
      reply: result.output,
      usage: undefined, // Agent executor doesn't provide token usage
    };
  } else {
    // Fall back to regular chat without tools
    console.log('📝 [AGENT-ENGINE-MCP] No MCP tools available, using regular chat');
    
    // Build the prompt
    // Memories are already in the expected format
    const formattedMemories = memoryArray;
    
    const prompt = buildPrompt(
      systemPrompt,
      formattedMemories,
      req.message
    );

    // Get LLM provider
    const provider = await ProviderFactory.getProvider(req.agent_id);

    // Execute completion
    const llmModel = await llmRepo.findById(agent.model);
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

    console.log('✅ [AGENT-ENGINE-MCP] Chat completed successfully');

    return result;
  }
}