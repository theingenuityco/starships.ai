import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory, AgentExpeditionContextService } from "@starships/models";
import { MCPToolWrapper } from "./tools/MCPToolWrapper";
import { mcpToolGatewayDB } from "@starships/core";
import type { ChatRequest, MemoryEntry } from "@starships/protocol";
import { AgentExecutor } from "langchain/agents";
import { createOpenAIFunctionsAgent, createToolCallingAgent } from "langchain/agents";
import { MCPAgentExecutor } from "./agents/MCPAgentExecutor";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { DEFAULT_AGENT_EXECUTOR_CONFIG } from "./config/agent-executor-config";
import { loadAgentExecutorConfig, mergeConfig } from "./config/environment";
import { fixLLMModel } from "./utils/neo4j-helpers";

/**
 * Execute agent with MCP tools and return the final response
 */
/**
 * Sanitize tool descriptions to prevent prompt template injection
 */
function sanitizeToolDescription(description: string): string {
  // Replace curly braces that could be interpreted as template variables
  return description
    .replace(/\{/g, '{{')
    .replace(/\}/g, '}}');
}

async function* executeWithAgent(
  mcpTools: any[],
  memoryArray: any[],
  message: string,
  systemPrompt: string,
  llmModel: any,
  llm: any,
  config = DEFAULT_AGENT_EXECUTOR_CONFIG
): AsyncGenerator<string, void, unknown> {
  try {
    // Enhance system prompt with tool descriptions (sanitized to prevent template injection)
    const toolDescriptions = mcpTools.map(tool => 
      `- ${tool.name}: ${sanitizeToolDescription(tool.description)}`
    ).join('\n');
    
    let enhancedSystemPrompt = systemPrompt + (mcpTools.length > 0 
      ? `\n\nYou have access to the following MCP (Model Context Protocol) tools that you can use to help the user:\n${toolDescriptions}

🔧 TOOL USAGE BEST PRACTICES:
- When using web search tools, keep queries SIMPLE and FOCUSED
- Use ONE tool call at a time instead of multiple simultaneous requests
- For web searches, use clear, specific keywords (e.g., "best food delivery apps 2024")
- Avoid overly complex or multi-part queries that may timeout
- If you need comprehensive information, make multiple simple searches instead of one complex query

When appropriate, use these tools to provide better assistance. You are connected to MCP servers that provide these capabilities.` 
      : '');
    
    // Escape any remaining curly braces to prevent LangChain template parsing errors
    enhancedSystemPrompt = enhancedSystemPrompt.replace(/\{/g, '{{').replace(/\}/g, '}}');
    
    // Create prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", enhancedSystemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);
    
    // Create appropriate agent - use tool calling agent for all providers
    // The OpenAIFunctionsAgent seems to have issues with returning empty output
    const agent = await createToolCallingAgent({
      llm,
      tools: mcpTools,
      prompt,
    });
    
    // Determine max iterations based on tools
    const maxIterations = getMaxIterations(mcpTools, config);
    
    // Debug: Log tools being passed to executor
    console.log('[MCP-EXECUTOR] Tools passed to executor:', mcpTools.map(t => ({ 
      name: t.name, 
      description: t.description.substring(0, 100) + '...' 
    })));
    
    // Create custom executor that fixes parameter passing
    const executor = MCPAgentExecutor.fromAgentAndTools({
      agent,
      tools: mcpTools,
      verbose: config.debug.verbose,
      maxIterations,
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
    
    // Track execution progress
    let lastProgressUpdate = Date.now();
    let toolCallCount = 0;
    const progressUpdates: string[] = [];
    
    // Set up progress tracking
    if (config.streaming.progressUpdates) {
      executor.callbacks = [{
        handleToolStart: async (tool, input) => {
          toolCallCount++;
          const now = Date.now();
          if (now - lastProgressUpdate > 1000) { // Update every second
            progressUpdates.push(`[Processing with ${tool.name}... (step ${toolCallCount})]`);
            lastProgressUpdate = now;
          }
        }
      }];
    }
    
    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Agent execution timeout')), config.timeouts.overall)
    );
    
    const result = await Promise.race([
      executor.invoke({
        input: message,
        chat_history: chatHistory,
      }),
      timeoutPromise
    ]) as any;
    
    console.log('[MCP-EXECUTOR] Agent executor result:', {
      hasOutput: !!result.output,
      outputLength: result.output?.length,
      output: result.output,
      intermediateSteps: result.intermediateSteps?.length,
      keys: Object.keys(result),
      fullResult: JSON.stringify(result, null, 2)
    });
    
    // Yield any progress updates that were collected
    for (const update of progressUpdates) {
      yield update;
    }
    
    // Return the final output
    if (!result.output) {
      console.error('[MCP-EXECUTOR] Agent returned no output!');
      yield 'I apologize, but I encountered an issue processing your request. Please try again.';
    } else {
      yield result.output;
    }
  } catch (error) {
    console.error('[MCP-EXECUTOR] Agent execution failed:', error);
    
    // Format error message based on environment
    if (config.debug.verbose) {
      throw error;
    } else {
      throw new Error(formatUserFriendlyError(error));
    }
  }
}

function getMaxIterations(tools: any[], config: any): number {
  // Find the highest requirement among tools
  let maxNeeded = config.maxIterations.default;
  
  for (const tool of tools) {
    const toolType = tool.name.split('_')[0]; // Extract tool type
    const toolMax = config.maxIterations.byToolType[toolType];
    if (toolMax && toolMax > maxNeeded) {
      maxNeeded = toolMax;
    }
  }
  
  return maxNeeded;
}

function formatUserFriendlyError(error: any): string {
  if (error.message.includes('timeout')) {
    return 'The operation took too long to complete. Please try again with a simpler request.';
  }
  if (error.message.includes('tool')) {
    return 'There was an issue processing your request. Please try rephrasing it.';
  }
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Enhanced streaming chat function with MCP tool integration
 * Note: Streaming with tools is more complex - for now, we'll execute tools synchronously
 * and then stream the final response
 */
export async function* chatWithMCPStream(
  req: ChatRequest,
  store: LangChainMemoryStore,
  options?: { overrideStarshipId?: string }
): AsyncGenerator<string, void, unknown> {
  console.log('🌊 [AGENT-ENGINE-MCP-STREAM] Starting MCP-enhanced streaming chat request:', {
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
    console.error('❌ [AGENT-ENGINE-MCP-STREAM] Agent not found:', req.agent_id);
    throw new Error(`Agent ${req.agent_id} not found`);
  }

  console.log('✅ [AGENT-ENGINE-MCP-STREAM] Agent found:', {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    starshipId: agent.starshipId,
    systemPrompt: agent.systemPrompt?.substring(0, 100) + '...',
  });
  
  // Add explicit logging for debugging
  console.log('🔍 [AGENT-ENGINE-MCP-STREAM] VISION DEBUG - Agent starshipId:', agent.starshipId);
  console.log('🔍 [AGENT-ENGINE-MCP-STREAM] VISION DEBUG - Agent starshipId type:', typeof agent.starshipId);
  console.log('🔍 [AGENT-ENGINE-MCP-STREAM] VISION DEBUG - Agent full object:', JSON.stringify(agent, null, 2));

  // ENHANCED USER ID RESOLUTION WITH COMPREHENSIVE FALLBACK STRATEGIES (STREAMING)
  console.log('🌊 [AGENT-ENGINE-MCP-STREAM] Starting enhanced vision context loading...');
  console.log('👤 [AGENT-ENGINE-MCP-STREAM] Original Kinde user ID:', req.user_id);
  
  // Step 1: Attempt to resolve internal user ID from Kinde user ID
  let internalUserId = req.user_id;
  let userResolutionSuccess = false;
  let fallbackToKindeId = false;
  
  try {
    console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Attempting to resolve internal user from Kinde ID...');
    const user = await userRepo.findByKindeId(req.user_id);
    if (user) {
      internalUserId = user.id;
      userResolutionSuccess = true;
      console.log('✅ [AGENT-ENGINE-MCP-STREAM] Internal user found successfully:', {
        internalUserId: internalUserId,
        username: user.username,
        email: user.email,
        kindeId: user.kindeId
      });
    } else {
      console.warn('⚠️ [AGENT-ENGINE-MCP-STREAM] No internal user found for Kinde ID');
      console.log('🔄 [AGENT-ENGINE-MCP-STREAM] Will attempt starship lookup with Kinde ID as fallback');
      fallbackToKindeId = true;
    }
  } catch (userError) {
    console.error('❌ [AGENT-ENGINE-MCP-STREAM] Error during user ID resolution:', {
      error: (userError as Error).message,
      stack: (userError as Error).stack
    });
    console.log('🔄 [AGENT-ENGINE-MCP-STREAM] Will attempt starship lookup with Kinde ID as fallback');
    fallbackToKindeId = true;
  }
  
  let visionContext = "";
  let expeditionContext = "";
  let starshipLookupStrategies: string[] = [];
  let starshipSlugFromChannel: string | null = null;
  
  // Load expedition context for agent awareness (STREAMING)
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
            console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Extracted expedition ID from channel:', expeditionIdFromChannel);
            
            // Check if starship ID is also included
            if (parts.length >= 4 && parts[2] === 'starship') {
              const starshipId = parts[3];
              console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Found starship ID in channel:', starshipId);
              // Add it to lookup strategies for direct use
              starshipLookupStrategies.push(`direct-starship:${starshipId}`);
            }
          }
        } else {
          // Old format with dashes
          const parts = req.channel_id.split('-');
          if (parts.length >= 2) {
            expeditionIdFromChannel = parts[1];
            console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Extracted expedition ID from channel (old format):', expeditionIdFromChannel);
          }
        }
      } else if (req.channel_id.startsWith('starship-')) {
        // Extract starship slug from channel_id format: starship-SLUG:agent-AGENTID:user-USERID
        const colonIndex = req.channel_id.indexOf(':');
        if (colonIndex > 0) {
          starshipSlugFromChannel = req.channel_id.substring(9, colonIndex); // 'starship-'.length = 9
          console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Extracted starship slug from channel:', starshipSlugFromChannel);
        }
      }
    }

    const contextService = AgentExpeditionContextService.getInstance();
    expeditionContext = await contextService.getAgentExpeditionContext(req.agent_id);
    
    if (expeditionContext) {
      console.log('🚢 [AGENT-ENGINE-MCP-STREAM] Expedition context loaded for agent:', {
        agentId: req.agent_id,
        contextLength: expeditionContext.length,
        hasExpedition: true
      });
    }

    // If we found an expedition ID in the channel but no expedition context, add basic context
    if (expeditionIdFromChannel && !expeditionContext) {
      console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Adding basic expedition context for ID:', expeditionIdFromChannel);
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
          console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Found starship ID from expedition:', expedition.starshipId);
          // We'll use this later for vision loading if user starships aren't found
          starshipLookupStrategies.push(`expedition-starship:${expedition.starshipId}`);
        } else {
          console.log('⚠️ [AGENT-ENGINE-MCP-STREAM] Expedition found but no starshipId:', {
            expeditionId: expeditionIdFromChannel,
            expeditionFound: !!expedition,
            starshipId: expedition?.starshipId
          });
        }
      } catch (expError) {
        console.log('⚠️ [AGENT-ENGINE-MCP-STREAM] Could not load expedition details:', expError);
      }
    }
  } catch (contextError) {
    console.log('⚠️ [AGENT-ENGINE-MCP-STREAM] Could not load expedition context:', contextError);
    // Continue without expedition context
  }
  
  // Step 2: Load the agent's assigned starship for proper isolation
  try {
    console.log('🚢 [AGENT-ENGINE-MCP-STREAM] Loading agent\'s assigned starship...');
    
    // CRITICAL FIX: Use the agent's starshipId to ensure proper isolation
    if (!agent.starshipId) {
      console.error('❌ [AGENT-ENGINE-MCP-STREAM] Agent has no starshipId assigned:', agent.id);
      throw new Error(`Agent ${agent.id} has no starship assigned`);
    }
    
    console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Fetching starship with ID:', agent.starshipId);
    const activeStarship = await starshipRepo.findById(agent.starshipId);
    
    if (!activeStarship) {
      console.error('❌ [AGENT-ENGINE-MCP-STREAM] Starship not found for agent:', {
        agentId: agent.id,
        starshipId: agent.starshipId
      });
      throw new Error(`Starship ${agent.starshipId} not found for agent ${agent.id}`);
    }
    
    console.log('✅ [AGENT-ENGINE-MCP-STREAM] Agent\'s starship loaded:', {
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
      console.error('❌ [AGENT-ENGINE-MCP-STREAM] Starship ownership mismatch:', {
        starshipOwnerId: activeStarship.ownerId,
        internalUserId: internalUserId,
        kindeUserId: req.user_id
      });
      throw new Error('Agent\'s starship does not belong to the requesting user');
    } else if (!isOwnerMatch && isTemporaryUser) {
      console.warn('⚠️ [AGENT-ENGINE-MCP-STREAM] Skipping ownership check for temporary user:', {
        starshipOwnerId: activeStarship.ownerId,
        tempUserId: req.user_id,
        reason: 'Temporary user IDs cannot be resolved to internal IDs'
      });
    }
    
    if (activeStarship) {
      console.log('🎯 [AGENT-ENGINE-MCP-STREAM] Active starship selected:', {
        id: activeStarship.id,
        name: activeStarship.name,
        class: activeStarship.class,
        ownerId: activeStarship.ownerId,
        status: activeStarship.status,
        selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
      });
      
      // Step 3: Enhanced vision loading with validation
      console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Querying vision for starship ID:', activeStarship.id);
      const vision = await visionRepo.findByStarship(activeStarship.id);
      
      console.log('👁️ [AGENT-ENGINE-MCP-STREAM] Vision database lookup result:', {
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
        console.log('📖 [AGENT-ENGINE-MCP-STREAM] Vision loaded successfully from database:', {
          length: vision.statement.length,
          preview: vision.statement.substring(0, 150) + '...',
          refinementCount: vision.refinementCount || 0,
          lastRefined: vision.lastRefined
        });
        
        visionContext = `\n\nCOMPANY/STARSHIP VISION:\n${vision.statement}\n\nIMPORTANT: This is YOUR company's vision. ALL work must align with this vision.\n\n⚠️ STRICT VISION ALIGNMENT POLICY:\n- You can ONLY work on expeditions that align with this vision\n- If an expedition's mission doesn't align with the vision, you MUST NOT proceed\n- Always check: "Does this expedition support our vision of ${vision.statement}?"\n- If NO: Inform the user they have two options:\n  1. Adjust the expedition mission to align with the current vision\n  2. Visit the Vision Chamber to update the company vision for strategic pivots\n- If YES: Proceed with enthusiasm while keeping the vision in mind\n\n💡 Remember: The Vision Chamber exists for strategic evolution. If the company is pivoting to new markets or products, the vision should be updated there first.\n`;
        console.log('✅ [AGENT-ENGINE-MCP-STREAM] Vision context prepared successfully, length:', visionContext.length);
      } else {
        console.log('📝 [AGENT-ENGINE-MCP-STREAM] Vision exists but has no usable statement');
        if (vision) {
          console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Vision investigation details:', {
            id: vision.id,
            starshipId: vision.starshipId,
            statement: vision.statement,
            statementType: typeof vision.statement,
            statementTrimmed: vision.statement?.trim(),
            refinementCount: vision.refinementCount
          });
        }
        console.log('⚠️ [AGENT-ENGINE-MCP-STREAM] Proceeding without vision context - empty/null statement');
      }
    } else {
      console.error('❌ [AGENT-ENGINE-MCP-STREAM] CRITICAL: Agent\'s starship could not be loaded');
      console.error('🔍 [AGENT-ENGINE-MCP-STREAM] Debug information:', {
        agentId: agent.id,
        starshipId: agent.starshipId,
        originalKindeId: req.user_id,
        resolvedInternalId: internalUserId
      });
      
      console.log('⚠️ [AGENT-ENGINE-MCP-STREAM] Proceeding without vision context - starship not accessible');
    }
  } catch (error) {
    console.error('❌ [AGENT-ENGINE-MCP-STREAM] Vision loading failed with critical error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      name: (error as Error).name,
      originalKindeId: req.user_id,
      resolvedInternalId: internalUserId
    });
    console.log('🔄 [AGENT-ENGINE-MCP-STREAM] Continuing without vision context due to critical error');
  }

  // Initialize MCP tools for the agent's starship
  let mcpTools: any[] = [];
  let starshipId: string | null = null;
  
  try {
    // Use override starshipId if provided, otherwise use agent's starshipId
    const effectiveStarshipId = options?.overrideStarshipId || agent.starshipId;
    console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Looking for agent starship. Agent starshipId:', agent.starshipId);
    console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Override starshipId:', options?.overrideStarshipId);
    console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Effective starshipId:', effectiveStarshipId);
    
    if (agent && effectiveStarshipId) {
      starshipId = effectiveStarshipId;
      console.log('🚢 [AGENT-ENGINE-MCP-STREAM] Using starship for MCP tools:', starshipId);
      
      // Create MCP tool wrapper
      const toolWrapper = new MCPToolWrapper({
        starshipId: starshipId!,
        agentId: req.agent_id,
        gateway: mcpToolGatewayDB,
        enableLogging: true
      });
      
      // Get available MCP tools
      console.log('🔧 [AGENT-ENGINE-MCP-STREAM] Attempting to create MCP tools...');
      mcpTools = await toolWrapper.createAllTools();
      console.log(`🔧 [AGENT-ENGINE-MCP-STREAM] Loaded ${mcpTools.length} MCP tools`);
      if (mcpTools.length > 0) {
        console.log('📋 [AGENT-ENGINE-MCP-STREAM] Available tools:', mcpTools.map(t => ({ name: t.name, description: t.description })));
      } else {
        console.log('⚠️ [AGENT-ENGINE-MCP-STREAM] No MCP tools found for starship. This might mean:');
        console.log('   - No MCP servers are configured for this starship');
        console.log('   - MCP servers are not running or not accessible');
        console.log('   - There was an error connecting to MCP servers');
      }
    } else {
      console.log('⚠️ [AGENT-ENGINE-MCP-STREAM] No starshipId found for agent');
    }
  } catch (error) {
    console.warn('⚠️ [AGENT-ENGINE-MCP-STREAM] Could not load MCP tools:', error);
    console.warn('   Stack trace:', (error as Error).stack);
  }

  // Get conversation history
  const memoryKey = store.makeKey(req.agent_id, req.user_id, req.channel_id);
  const memories = await store.get(memoryKey);
  const memoryArray = memories.slice(-10); // Get last 10 messages

  // Build system prompt
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
  
  systemPrompt += visionContext;
  systemPrompt += expeditionContext;
  
  // Load environment config and merge with defaults
  const envConfig = loadAgentExecutorConfig();
  const config = mergeConfig(DEFAULT_AGENT_EXECUTOR_CONFIG, envConfig);

  // For now, if MCP tools are available, we need to handle them differently
  // since streaming with tool execution is complex
  if (mcpTools.length > 0) {
    console.log('🎯 [AGENT-ENGINE-MCP-STREAM] MCP tools available - using agent executor');
    
    try {
      // Check if streaming is enabled
      if (!config.streaming.enabled) {
        console.log('🔄 [AGENT-ENGINE-MCP-STREAM] Streaming disabled, falling back to non-streaming');
        // Import and use non-streaming version
        const { chatWithMCP } = await import('./chat-with-mcp');
        const result = await chatWithMCP(req, store);
        yield result.reply;
        return;
      }
      
      // Get LLM model configuration
      // Try to find by ID first, then by name if it looks like a model name
      let rawLLMModel = await llmRepo.findById(agent.model);
      
      // If not found and doesn't look like a UUID, try finding by name
      if (!rawLLMModel && !agent.model.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.log(`🔍 [AGENT-ENGINE-MCP-STREAM] Model ID "${agent.model}" not found, searching by name...`);
        const allModels = await llmRepo.findAll();
        rawLLMModel = allModels.find(m => m.name === agent.model || m.id === agent.model) || null;
      }
      
      if (!rawLLMModel) {
        console.error(`❌ [AGENT-ENGINE-MCP-STREAM] LLM model "${agent.model}" not found in database`);
        console.error('   This usually means the LLM models haven\'t been seeded.');
        console.error('   Run: cd packages/models && npm run seed:llm');
        throw new Error(`LLM model ${agent.model} not found. Please ensure LLM models are properly seeded in the database.`);
      }
      
      // Fix Neo4j integer conversion issues
      const llmModel = fixLLMModel(rawLLMModel);
      
      // Create LLM instance
      const llm = llmModel.provider === 'openai' 
        ? new ChatOpenAI({
            model: llmModel.name,
            temperature: llmModel.temperature,
            maxTokens: llmModel.maxTokens,
            apiKey: process.env.OPENAI_API_KEY,
          })
        : new ChatAnthropic({
            model: llmModel.name,
            temperature: llmModel.temperature,
            maxTokens: llmModel.maxTokens,
            apiKey: process.env.ANTHROPIC_API_KEY,
          });
      
      // Execute using agent executor with streaming
      console.log('🤖 [AGENT-ENGINE-MCP-STREAM] Executing with agent executor...');
      
      let fullResponse = '';
      const responseChunks: string[] = [];
      let executionStartTime = Date.now();
      
      // Execute and collect progress updates
      for await (const chunk of executeWithAgent(
        mcpTools,
        memoryArray,
        req.message,
        systemPrompt,
        llmModel,
        llm,
        config
      )) {
        if (chunk.startsWith('[Processing')) {
          // Yield progress updates immediately
          yield chunk + '\n';
        } else {
          // Collect the final response
          fullResponse = chunk;
        }
      }
      
      const executionTime = Date.now() - executionStartTime;
      console.log(`📝 [AGENT-ENGINE-MCP-STREAM] Agent execution complete in ${executionTime}ms, streaming response...`);
      
      // Only stream if we have a response
      if (fullResponse && fullResponse.length > 0) {
        // Stream the final response in chunks
        for (let i = 0; i < fullResponse.length; i += config.streaming.chunkSize) {
          yield fullResponse.slice(i, i + config.streaming.chunkSize);
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, config.streaming.delayMs));
        }
      }
      
      // Only store messages if we have a valid response
      if (fullResponse && fullResponse.length > 0) {
        // Store both user and assistant messages after successful completion
        await store.append(memoryKey, {
          role: 'user',
          content: req.message,
          timestamp: Date.now() - executionTime // Backdate to start
        } as MemoryEntry);
        
        await store.append(memoryKey, {
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now()
        } as MemoryEntry);
      } else {
        console.warn('[AGENT-ENGINE-MCP-STREAM] Skipping memory storage due to empty response');
      }
      
      console.log('✅ [AGENT-ENGINE-MCP-STREAM] Streaming completed successfully');
      
    } catch (error) {
      console.error('❌ [AGENT-ENGINE-MCP-STREAM] Error during agent execution:', error);
      
      // Fallback to non-streaming on error
      if (config.fallback.enabled) {
        console.log('🔄 [AGENT-ENGINE-MCP-STREAM] Falling back to non-streaming due to error');
        try {
          const { chatWithMCP } = await import('./chat-with-mcp');
          const result = await chatWithMCP(req, store);
          yield result.reply;
        } catch (fallbackError) {
          console.error('❌ [AGENT-ENGINE-MCP-STREAM] Fallback also failed:', fallbackError);
          
          // Provide more helpful error message based on the error
          if (fallbackError instanceof Error && fallbackError.message.includes('LLM model')) {
            yield 'I\'m having trouble connecting to my language model. Please contact support to resolve this configuration issue.';
          } else {
            yield 'I encountered an error while processing your request. Please try again.';
          }
        }
      } else {
        // Re-throw if fallback is disabled
        throw error;
      }
    }
  } else {
    // No MCP tools - use regular streaming
    console.log('📝 [AGENT-ENGINE-MCP-STREAM] No MCP tools available, using regular streaming');
    
    const formattedMemories = memoryArray;
    const prompt = buildPrompt(
      systemPrompt,
      formattedMemories,
      req.message
    );

    const provider = await ProviderFactory.getProvider(req.agent_id);
    const rawLLMModel = await llmRepo.findById(agent.model);
    
    // Fix Neo4j integer conversion issues
    const llmModel = fixLLMModel(rawLLMModel);
    
    const opts = {
      temperature: llmModel?.temperature,
      maxTokens: llmModel?.maxTokens,
    };

    let fullResponse = '';
    
    // Stream the response
    for await (const chunk of provider.completeStream(prompt, opts)) {
      fullResponse += chunk;
      yield chunk;
    }

    // Store assistant message after streaming completes
    console.log('💾 [AGENT-ENGINE-MCP-STREAM] Storing assistant message in memory...');
    await store.append(memoryKey, {
      role: 'assistant',
      content: fullResponse,
      timestamp: Date.now()
    } as MemoryEntry);

    console.log('✅ [AGENT-ENGINE-MCP-STREAM] Streaming completed successfully');
  }
}