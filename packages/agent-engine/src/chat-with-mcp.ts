import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory } from "@starships/models";
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
export async function chatWithMCP(req: ChatRequest, store: LangChainMemoryStore): Promise<ChatResponse> {
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

  // Resolve user and starship context (similar to original chat function)
  let internalUserId = req.user_id;
  let visionContext = "";
  
  try {
    const user = await userRepo.findByKindeId(req.user_id);
    if (user) {
      internalUserId = user.id;
    }
  } catch (error) {
    console.warn('⚠️ [AGENT-ENGINE-MCP] Could not resolve internal user ID');
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
    console.warn('⚠️ [AGENT-ENGINE-MCP] Could not load vision context:', error);
  }

  // Initialize MCP tools for the agent's starship
  let mcpTools: any[] = [];
  let starshipId: string | null = null;
  
  try {
    // Get the agent's starship directly from agent data
    console.log('🔍 [AGENT-ENGINE-MCP] Looking for agent starship. Agent starshipId:', agent.starshipId);
    if (agent && agent.starshipId) {
      starshipId = agent.starshipId;
      console.log('🚢 [AGENT-ENGINE-MCP] Found starship for agent:', starshipId);
      
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
  if (mcpTools.length > 0) {
    systemPrompt += `\n\nYou have access to the following MCP (Model Context Protocol) tools that you can use to help the user:
${mcpTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

When appropriate, use these tools to provide better assistance. You are connected to MCP servers that provide these capabilities.`;
  }
  
  systemPrompt += visionContext;
  
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