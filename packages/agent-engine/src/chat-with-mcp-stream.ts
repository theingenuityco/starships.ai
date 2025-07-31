import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory } from "@starships/models";
import { MCPToolWrapper } from "./tools/MCPToolWrapper";
import { mcpToolGatewayDB } from "@starships/core";
import type { ChatRequest, MemoryEntry } from "@starships/protocol";
import { AgentExecutor } from "langchain/agents";
import { createOpenAIFunctionsAgent, createToolCallingAgent } from "langchain/agents";
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
    
    const enhancedSystemPrompt = systemPrompt + (mcpTools.length > 0 
      ? `\n\nYou have access to the following MCP (Model Context Protocol) tools that you can use to help the user:\n${toolDescriptions}\n\nWhen appropriate, use these tools to provide better assistance. You are connected to MCP servers that provide these capabilities.` 
      : '');
    
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
    
    // Create executor with proper settings
    const executor = new AgentExecutor({
      agent,
      tools: mcpTools,
      verbose: config.debug.verbose,
      maxIterations,
      returnIntermediateSteps: true,
      handleParsingErrors: true,
      // Add early stopping to prevent infinite loops
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
  store: LangChainMemoryStore
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

  // Resolve user and starship context
  let internalUserId = req.user_id;
  let visionContext = "";
  
  try {
    const user = await userRepo.findByKindeId(req.user_id);
    if (user) {
      internalUserId = user.id;
    }
  } catch (error) {
    console.warn('⚠️ [AGENT-ENGINE-MCP-STREAM] Could not resolve internal user ID');
  }

  // Get vision context from agent's starship
  try {
    if (agent.starshipId) {
      const starship = await starshipRepo.findById(agent.starshipId);
      if (starship) {
        // Verify ownership
        const isOwnerMatch = starship.ownerId === internalUserId || starship.ownerId === req.user_id;
        if (!isOwnerMatch) {
          throw new Error('Agent\'s starship does not belong to the requesting user');
        }
        
        const vision = await visionRepo.findByStarship(agent.starshipId);
        if (vision) {
          visionContext = `\n\n[STARSHIP CONTEXT]\nVision: ${vision.statement || 'None specified'}`;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ [AGENT-ENGINE-MCP-STREAM] Could not load vision context:', error);
  }

  // Initialize MCP tools for the agent's starship
  let mcpTools: any[] = [];
  let starshipId: string | null = null;
  
  try {
    console.log('🔍 [AGENT-ENGINE-MCP-STREAM] Looking for agent starship. Agent starshipId:', agent.starshipId);
    if (agent && agent.starshipId) {
      starshipId = agent.starshipId;
      console.log('🚢 [AGENT-ENGINE-MCP-STREAM] Found starship for agent:', starshipId);
      
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
  
  systemPrompt += visionContext;
  
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
      const rawLLMModel = await llmRepo.findById(agent.model);
      if (!rawLLMModel) {
        console.error(`❌ [AGENT-ENGINE-MCP-STREAM] LLM model "${agent.model}" not found in database`);
        console.error('   This usually means the LLM models haven\'t been seeded.');
        console.error('   Run: cd packages/models && npm run seed');
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