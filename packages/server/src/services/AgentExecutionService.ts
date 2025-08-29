import { RepositoryFactory } from '@starships/models';
import type { ChatRequest, ChatResponse, MemoryEntry } from '@starships/protocol';
import { LLMService } from './LLMService';
import { ToolService } from './ToolService';
import { DatabaseMemoryStore } from '../utils/database-memory';
import { buildPrompt } from '../utils/prompt';
import { loadVisionContext } from '../utils/vision';
import { resolveLLMModel } from '../utils/llm-resolver';

/**
 * Agent Execution Service
 * Replaces the complex agents/chat.ts logic with clean service architecture
 * Follows the same pattern as SibilService
 */
export class AgentExecutionService {
  private static memoryStore = new DatabaseMemoryStore();

  /**
   * Execute agent chat with tool calling support
   */
  static async executeChat(request: ChatRequest): Promise<ChatResponse> {
    const { agent_id, user_id, message } = request;

    if (!agent_id) {
      throw new Error('agent_id is required for agent chat');
    }

    console.log('🚀 [AGENT-EXECUTION] Starting chat request:', {
      agent_id,
      user_id,
      message,
      timestamp: new Date().toISOString(),
    });

    // Get agent and validate
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.findById(agent_id);

    if (!agent) {
      console.error('❌ [AGENT-EXECUTION] Agent not found:', agent_id);
      throw new Error(`Agent ${agent_id} not found`);
    }

    console.log('✅ [AGENT-EXECUTION] Agent found:', {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      starshipId: agent.starshipId,
    });

    // Load vision context
    const visionContext = await loadVisionContext(agent_id, user_id, agent);

    // Initialize tools if starship is available
    let toolService: ToolService | null = null;
    let availableTools: Awaited<ReturnType<ToolService['getAllTools']>> = [];
    
    if (agent.starshipId) {
      try {
        console.log('🔧 [AGENT-EXECUTION] Initializing tools for starship:', agent.starshipId);
        toolService = new ToolService({
          starshipId: agent.starshipId,
          agentId: agent_id,
          enableLogging: true
        });
        
        availableTools = await toolService.getAllTools();
        console.log(`🔧 [AGENT-EXECUTION] Loaded ${availableTools.length} tools`);
        
        if (availableTools.length > 0) {
          console.log('📋 [AGENT-EXECUTION] Available tools:', 
            availableTools.map(t => ({ name: t.name, description: t.description }))
          );
        }
      } catch (error) {
        console.warn('⚠️ [AGENT-EXECUTION] Could not load tools:', error);
      }
    }

    // Get conversation history
    const memoryKey = this.memoryStore.makeKey(agent_id, user_id);
    const memories = await this.memoryStore.get(memoryKey);
    const memoryArray = memories.slice(-10); // Last 10 messages

    // Build system prompt with tools context
    let systemPrompt = agent.systemPrompt || "You are a helpful AI assistant.";
    
    if (availableTools.length > 0) {
      systemPrompt += `\n\nYou have access to the following tools:
${availableTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

🔧 TOOL USAGE GUIDELINES:
- Use tools when they can help provide better assistance
- For web searches, keep queries simple and focused
- Use one tool call at a time for best results
- If you need comprehensive information, make multiple focused searches

When appropriate, use these tools to provide enhanced assistance.`;
    }
    
    systemPrompt += visionContext;

    // Execute with or without tools
    if (availableTools.length > 0 && toolService) {
      return await this.executeWithTools(
        request,
        agent,
        systemPrompt,
        memoryArray,
        toolService,
        availableTools,
        memoryKey
      );
    } else {
      return await this.executeWithoutTools(
        request,
        agent,
        systemPrompt,
        memoryArray,
        memoryKey
      );
    }
  }

  /**
   * Execute agent chat with tool calling support
   */
  private static async executeWithTools(
    request: ChatRequest,
    agent: any,
    systemPrompt: string,
    memoryArray: MemoryEntry[],
    toolService: ToolService,
    availableTools: Awaited<ReturnType<ToolService['getAllTools']>>,
    memoryKey: string
  ): Promise<ChatResponse> {
    console.log('🤖 [AGENT-EXECUTION] Executing with tools');

    // Get LLM model configuration
    const llmModel = await resolveLLMModel(agent.model);
    const llmService = new LLMService(llmModel);
    
    // Convert tools to LLM tool definitions
    const toolDefinitions = toolService.getToolDefinitions(availableTools);
    
    // Build conversation prompt
    const prompt = buildPrompt(systemPrompt, memoryArray, request.message);
    
    // Execute with tool calling loop
    const result = await this.executeToolCallingLoop(
      llmService,
      prompt,
      toolDefinitions,
      toolService,
      availableTools,
      llmModel.temperature
    );

    // Store conversation in memory
    await this.memoryStore.append(memoryKey, {
      role: 'user',
      content: request.message,
      timestamp: Date.now()
    } as MemoryEntry);
    
    await this.memoryStore.append(memoryKey, {
      role: 'assistant',
      content: result.reply,
      timestamp: Date.now()
    } as MemoryEntry);

    return {
      source: 'agent',
      content: result.reply,
      agent_id: request.agent_id,
      usage: result.usage,
    };
  }

  /**
   * Execute agent chat without tools (fallback)
   */
  private static async executeWithoutTools(
    request: ChatRequest,
    agent: any,
    systemPrompt: string,
    memoryArray: MemoryEntry[],
    memoryKey: string
  ): Promise<ChatResponse> {
    console.log('📝 [AGENT-EXECUTION] Executing without tools');

    // Get LLM model and create service
    const llmModel = await resolveLLMModel(agent.model);
    const llmService = new LLMService(llmModel);

    // Build conversation prompt
    const prompt = buildPrompt(systemPrompt, memoryArray, request.message);

    // Execute completion
    const result = await llmService.complete(prompt, { 
      temperature: llmModel?.temperature 
    });

    // Store conversation in memory
    await this.memoryStore.append(memoryKey, {
      role: 'user',
      content: request.message,
      timestamp: Date.now()
    } as MemoryEntry);
    
    await this.memoryStore.append(memoryKey, {
      role: 'assistant',
      content: result.reply,
      timestamp: Date.now()
    } as MemoryEntry);

    console.log('✅ [AGENT-EXECUTION] Chat completed successfully');

    return {
      source: 'agent',
      content: result.reply,
      agent_id: request.agent_id,
      usage: result.usage
    };
  }

  /**
   * Tool calling loop - replaces LangChain's AgentExecutor
   */
  private static async executeToolCallingLoop(
    llmService: LLMService,
    prompt: any,
    toolDefinitions: any[],
    toolService: ToolService,
    availableTools: any[],
    temperature?: number,
    maxIterations: number = 10
  ) {
    let iteration = 0;
    let currentPrompt = prompt;
    
    while (iteration < maxIterations) {
      iteration++;
      
      // Get LLM response with tool definitions
      const result = await llmService.complete(currentPrompt, {
        tools: toolDefinitions,
        temperature
      });

      // If no tool calls, return the response
      if (!result.toolCalls || result.toolCalls.length === 0) {
        console.log(`🎯 [AGENT-EXECUTION] Completed in ${iteration} iterations`);
        return result;
      }

      // Execute tool calls
      console.log(`🔧 [AGENT-EXECUTION] Executing ${result.toolCalls.length} tool calls (iteration ${iteration})`);
      
      let toolResults = '';
      
      for (const toolCall of result.toolCalls) {
        try {
          const toolResult = await toolService.executeTool(
            availableTools, 
            toolCall.name, 
            toolCall.arguments
          );
          
          toolResults += `Tool ${toolCall.name} result: ${toolResult}\n\n`;
          console.log(`✅ [AGENT-EXECUTION] Tool ${toolCall.name} executed successfully`);
        } catch (error) {
          const errorMsg = `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          toolResults += `${errorMsg}\n\n`;
          console.error(`❌ [AGENT-EXECUTION] ${errorMsg}`);
        }
      }

      // Update prompt with tool results for next iteration
      currentPrompt = {
        messages: [
          ...currentPrompt.messages,
          { role: 'assistant', content: result.reply },
          { role: 'user', content: `Tool results:\n${toolResults}\n\nPlease provide your final response based on these tool results.` }
        ]
      };
    }

    throw new Error(`Tool calling loop exceeded maximum iterations (${maxIterations})`);
  }

  /**
   * Get memory store instance
   */
  static getMemoryStore(): DatabaseMemoryStore {
    return this.memoryStore;
  }
}