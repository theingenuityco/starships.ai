import { buildPrompt } from "./prompt/builder";
import { LangChainMemoryStore } from "./memory/langchain-memory";
import { ProviderFactory } from "./llm/provider-factory";
import { RepositoryFactory } from "@starships/models";
import { MCPToolWrapper } from "./tools/MCPToolWrapper";
import { mcpToolGatewayDB } from "@starships/core";
import type { ChatRequest, MemoryEntry } from "@starships/protocol";

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
  
  // Store user message before streaming
  console.log('💾 [AGENT-ENGINE-MCP-STREAM] Storing user message in memory...');
  await store.append(memoryKey, {
    role: 'user',
    content: req.message,
    timestamp: Date.now()
  } as MemoryEntry);

  // For now, if MCP tools are available, we need to handle them differently
  // since streaming with tool execution is complex
  if (mcpTools.length > 0) {
    console.log('🎯 [AGENT-ENGINE-MCP-STREAM] MCP tools available - using non-streaming execution with simulated streaming');
    
    // Build the prompt
    const formattedMemories = memoryArray;
    const prompt = buildPrompt(
      systemPrompt,
      formattedMemories,
      req.message
    );

    console.log('🤖 [AGENT-ENGINE-MCP-STREAM] Getting LLM provider...');
    // Get LLM provider and execute
    const provider = await ProviderFactory.getProvider(req.agent_id);
    const llmModel = await llmRepo.findById(agent.model);
    console.log('📡 [AGENT-ENGINE-MCP-STREAM] Sending request to LLM with temperature:', llmModel?.temperature);
    
    const result = await provider.complete(prompt, { 
      temperature: llmModel?.temperature,
      tools: mcpTools 
    });
    console.log('📝 [AGENT-ENGINE-MCP-STREAM] Received response, length:', result.reply?.length || 0);
    
    // Handle tool calls if present
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log('🔧 [AGENT-ENGINE-MCP-STREAM] Tool calls detected:', result.toolCalls.length);
      
      // Execute tool calls
      const toolResults = [];
      for (const toolCall of result.toolCalls) {
        console.log(`🔧 [AGENT-ENGINE-MCP-STREAM] Executing tool: ${toolCall.name}`);
        try {
          // Find the tool
          const tool = mcpTools.find(t => t.name === toolCall.name);
          if (tool && tool.func) {
            const toolResult = await tool.func(toolCall.arguments);
            toolResults.push({
              toolCallId: toolCall.id,
              result: toolResult
            });
          }
        } catch (error) {
          console.error(`❌ [AGENT-ENGINE-MCP-STREAM] Tool execution failed:`, error);
          toolResults.push({
            toolCallId: toolCall.id,
            error: error instanceof Error ? error.message : 'Tool execution failed'
          });
        }
      }
      
      // Create a new conversation with tool results
      const assistantMessage = result.reply || 'Let me use the available tools to help you.';
      const toolResultsMessage = toolResults.map(tr => 
        `Tool ${tr.toolCallId}: ${JSON.stringify(tr.result || tr.error)}`
      ).join('\n');
      
      // Build new messages for the follow-up
      const newMessages = [
        ...formattedMemories,
        { role: 'user' as const, content: req.message },
        { role: 'assistant' as const, content: assistantMessage },
        { role: 'user' as const, content: `Tool results:\n${toolResultsMessage}\n\nPlease provide a response based on these tool results.` }
      ];
      
      const finalPrompt = { messages: newMessages };
      const finalResult = await provider.complete(finalPrompt, { 
        temperature: llmModel?.temperature,
        tools: mcpTools 
      });
      
      result.reply = finalResult.reply;
    }
    
    // Simulate streaming by yielding chunks
    const replyText = result.reply || '';
    const chunkSize = 5; // Characters per chunk
    let totalChunks = 0;
    
    if (replyText.length > 0) {
      for (let i = 0; i < replyText.length; i += chunkSize) {
        yield replyText.slice(i, i + chunkSize);
        totalChunks++;
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } else {
      // If no reply, yield a default message
      yield 'Processing your request...';
      totalChunks = 1;
    }
    
    console.log('🌊 [AGENT-ENGINE-MCP-STREAM] Streamed', totalChunks, 'chunks');
    
    // Store assistant message
    await store.append(memoryKey, {
      role: 'assistant',
      content: replyText || 'Processing your request...',
      timestamp: Date.now()
    } as MemoryEntry);
    
    console.log('✅ [AGENT-ENGINE-MCP-STREAM] MCP-enhanced chat completed successfully');
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
    const llmModel = await llmRepo.findById(agent.model);
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