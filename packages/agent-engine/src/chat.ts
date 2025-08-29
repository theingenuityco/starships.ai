import { buildPrompt } from "./prompt";
import { DatabaseMemoryStore } from "./memory/database-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory } from "@starships/models";
import { NativeToolWrapper } from "./tools/NativeToolWrapper";
import { loadVisionContext } from "./vision";
import { resolveLLMModel } from "./llm-resolver";
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
  store: DatabaseMemoryStore,
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

  // Load vision context using extracted function
  const visionContext = await loadVisionContext(req.agent_id, req.user_id, agent);

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
    
    // Create the LLM instance using extracted resolver
    const llmModel = await resolveLLMModel(agent.model);
    
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

    // Execute completion using extracted resolver
    const llmModel = await resolveLLMModel(agent.model);
    
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
