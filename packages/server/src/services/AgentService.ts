/**
 * Agent Service
 *
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and
 * stateless execution engine (autopilot Agent).
 */

import { Agent, AgentParams, ChildProcessRunner, ExecutionItemUtils, LlmMessage } from '@starships/autopilot';
import { NotFoundError, ValidationError } from '@starships/errors';
import { AgentRepository, StarshipRepository } from '@starships/models';
import { generateSimpleAgentSlug, generateUniqueAgentSlug } from '@starships/models';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import { MessageService } from './MessageService';
import type { StreamingService } from './StreamingService';
import { EnvironmentService } from './EnvironmentService';
import { getEnvConfig } from '@starships/env';

export interface ConversationRequest {
  agentId: string;
  userId: string;
  message: string;
  conversationId?: string;
}

export interface ConversationResponse {
  source: 'agent';
  content: string;
  agentId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ConversationStreamingRequest extends ConversationRequest {
  streamId: string;
  streamingService: StreamingService;
}

/**
 * Service class for managing agents and their execution
 */
export class AgentService {
  private agentRepository: AgentRepository;
  private starshipRepository: StarshipRepository;
  private messageService: MessageService;
  private environmentService: EnvironmentService;

  constructor() {
    this.agentRepository = new AgentRepository();
    this.starshipRepository = new StarshipRepository();
    this.messageService = new MessageService();
    this.environmentService = new EnvironmentService();
  }

  /** Safely get starshipId from agent */
  private async getAgentStarshipIdOrThrow(agentId: string): Promise<string> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }
    if (!agent.starshipId) {
      throw new Error('Agent has no starship assigned');
    }
    return agent.starshipId;
  }

  /**
   * Validate that the starship can accommodate a new agent
   * @param starshipId The starship ID to check
   * @throws ValidationError if the agent limit is exceeded
   */
  private async validateAgentLimit(starshipId: string): Promise<void> {
    // Get the starship to check its maxAgents limit
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }

    // Get current deployed agents count
    const currentAgents = await this.starshipRepository.getDeployedAgents(starshipId);

    if (currentAgents.length >= starship.maxAgents) {
      throw new ValidationError(
        `Agent limit reached. Maximum ${starship.maxAgents} agents allowed per starship. Currently deployed: ${currentAgents.length}`
      );
    }
  }

  // ============================================================================
  // AGENT MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new agent and return as AgentModel
   */
  async createAgent(data: CreateAgentRequest & { starshipId: string }): Promise<AgentModel> {
    // Validate agent limit before creating
    await this.validateAgentLimit(data.starshipId);

    // Ensure unique slug:
    // - If a slug is provided, use it if unique; otherwise append a random suffix based on the provided slug.
    // - If no slug is provided, generate a unique slug from the name (kebab-case + suffix).
    const requestedSlug = (data.slug || '').trim();
    let slug: string;
    if (requestedSlug.length > 0) {
      const base = requestedSlug.toLowerCase();
      const existing = await this.agentRepository.findBySlug(base);
      slug = existing ? await generateUniqueAgentSlug(base, this.agentRepository) : base;
    } else {
      const baseFromName = (data.name || 'agent').toLowerCase().trim().replace(/\s+/g, '-') || 'agent';
      slug = await generateUniqueAgentSlug(baseFromName, this.agentRepository);
    }

    // Create agent parameters for the Agent class
    const agentParams: AgentParams = {
      name: data.name,
      description: data.description,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      timeout: data.timeout || 30000,
      systemPrompt: data.systemPrompt,
      state: data.state, // Let Agent class handle state initialization
      blueprint: data.blueprint, // This will be null/undefined to trigger default blueprint generation
    };

    // Instantiate Agent class to generate default blueprint if needed
    const agent = new Agent(agentParams);
    const generatedBlueprint = agent.getCurrentBlueprint();

    // Initialize state with default if not provided (same logic as Agent class)
    const agentState = data.state || { tools: [], messages: [] };

    const agentData: CreateAgentRequest = {
      name: data.name,
      slug,
      description: data.description,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      timeout: data.timeout || 30000,
      blueprint: generatedBlueprint, // Use the blueprint from Agent class (default or provided)
      systemPrompt: data.systemPrompt,
      state: agentState, // Use provided state or default initialization
      previewPrompts: data.previewPrompts,
      assignedToolSlugs: data.assignedToolSlugs,
      templateId: data.templateId,
    };

    return await this.agentRepository.create(agentData, data.starshipId);
  }

  /**
   * Check if an agent is a system agent (Gaia or Daedalus)
   */
  private isSystemAgent(agent: AgentModel): boolean {
    return agent.name === 'Gaia' || agent.name === 'Daedalus';
  }

  /**
   * Update agent and return as AgentModel
   */
  async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    // First get the current agent to check if it's a system agent
    const currentAgent = await this.agentRepository.findById(agentId);
    if (!currentAgent) {
      return null;
    }

    // Prevent editing system agents
    if (this.isSystemAgent(currentAgent)) {
      throw new ValidationError(
        `Cannot edit system agent "${currentAgent.name}". System agents (Gaia and Daedalus) are protected and cannot be modified.`
      );
    }

    return await this.agentRepository.update(agentId, updates as Partial<AgentModel>);
  }

  /**
   * Get agent by ID as AgentModel
   */
  async getAgent(agentId: string): Promise<AgentModel | null> {
    return await this.agentRepository.findById(agentId);
  }

  /**
   * Get agent by slug as AgentModel
   */
  async getAgentBySlug(slug: string): Promise<AgentModel | null> {
    return await this.agentRepository.findBySlug(slug);
  }

  /**
   * Get agents by starship as AgentModel array
   */
  async getAgentsByStarship(starshipId: string): Promise<AgentModel[]> {
    return await this.agentRepository.findByStarship(starshipId);
  }

  /**
   * Search agents and return as AgentModel array
   */
  async searchAgents(query: string): Promise<AgentModel[]> {
    return await this.agentRepository.searchAgents(query);
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<boolean> {
    // First get the current agent to check if it's a system agent
    const currentAgent = await this.agentRepository.findById(agentId);
    if (!currentAgent) {
      return false;
    }

    // Prevent deleting system agents
    if (this.isSystemAgent(currentAgent)) {
      throw new ValidationError(
        `Cannot delete system agent "${currentAgent.name}". System agents (Gaia and Daedalus) are protected and cannot be deleted.`
      );
    }

    return await this.agentRepository.delete(agentId);
  }

  /**
   * Update agent starship assignment (for routes layer)
   */
  async updateAgentStarship(agentId: string, starshipId: string): Promise<AgentModel | null> {
    // Check if agent exists first
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    return await this.agentRepository.updateStarship(agentId, starshipId);
  }

  /**
   * Get all agents with optional pagination
   */
  async getAllAgents(limit?: number, offset?: number): Promise<AgentModel[]> {
    const allAgents = await this.agentRepository.findAll();

    // Apply pagination if specified
    if (limit !== undefined && offset !== undefined) {
      return allAgents.slice(offset, offset + limit);
    }

    return allAgents;
  }

  /**
   * Get agents with pagination metadata
   */
  async getAgentsWithPagination(
    page: number = 1,
    limit: number = 50
  ): Promise<{
    agents: AgentModel[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }> {
    const allAgents = await this.agentRepository.findAll();
    const total = allAgents.length;
    const offset = (page - 1) * limit;
    const paginatedAgents = allAgents.slice(offset, offset + limit);

    return {
      agents: paginatedAgents,
      pagination: {
        page,
        limit,
        total,
        has_next: offset + limit < total,
        has_prev: page > 1,
      },
    };
  }

  /**
   * Validate starship access for a user
   */
  async validateStarshipAccess(starshipId: string, userId: string): Promise<boolean> {
    const { StarshipRepository } = await import('@starships/models');
    const starshipRepository = new StarshipRepository();
    const starship = await starshipRepository.findById(starshipId);

    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }

    return starship.ownerId === userId;
  }

  /**
   * Get agents by starship with access control
   */
  async getAgentsByStarshipWithAccess(
    starshipId: string,
    userId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ agents: AgentModel[]; total: number; pagination: any }> {
    // Validate access first
    await this.validateStarshipAccess(starshipId, userId);

    // Get all agents for the starship
    const allAgents = await this.getAgentsByStarship(starshipId);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedAgents = allAgents.slice(startIndex, startIndex + limit);

    return {
      agents: paginatedAgents,
      total: allAgents.length,
      pagination: {
        page,
        limit,
        total: allAgents.length,
        has_next: startIndex + limit < allAgents.length,
        has_prev: page > 1,
      },
    };
  }

  // ============================================================================
  // MODEL ↔ INSTANCE CONVERSION METHODS
  // ============================================================================

  // ============================================================================
  // TOOL ASSIGNMENT METHODS
  // ============================================================================

  /**
   * Get tools assigned to an agent
   */
  async getAgentTools(agentId: string, starshipId: string): Promise<import('@starships/protocol').ToolModel[]> {
    return await this.agentRepository.getAgentTools(agentId, starshipId);
  }

  /**
   * Get tools assigned to an agent, deriving starship from agent and validating access
   */
  async getAgentToolsForAgent(agentId: string, userId: string): Promise<import('@starships/protocol').ToolModel[]> {
    const starshipId = await this.getAgentStarshipIdOrThrow(agentId);
    const hasAccess = await this.validateStarshipAccess(starshipId, userId);
    if (!hasAccess) {
      throw new Error('Access denied to this starship');
    }
    return await this.getAgentTools(agentId, starshipId);
  }

  /**
   * Assign multiple tools to an agent via relationships (replaces existing assignments)
   */
  async assignToolSlugs(agentId: string, toolSlugs: string[], starshipId: string): Promise<AgentModel> {
    // Use the new relationship-based approach
    await this.agentRepository.assignToolsToAgent(agentId, toolSlugs, starshipId);

    // Return the updated agent
    const updatedAgent = await this.agentRepository.findById(agentId);
    if (!updatedAgent) {
      throw new NotFoundError('Agent', agentId);
    }
    return updatedAgent;
  }

  /**
   * Assign multiple tools by deriving starship from agent and validating access
   */
  async assignToolSlugsDerived(agentId: string, userId: string, toolSlugs: string[]): Promise<AgentModel> {
    const starshipId = await this.getAgentStarshipIdOrThrow(agentId);
    const hasAccess = await this.validateStarshipAccess(starshipId, userId);
    if (!hasAccess) {
      throw new Error('Access denied to this starship');
    }
    return await this.assignToolSlugs(agentId, toolSlugs, starshipId);
  }

  /**
   * Add a single tool to an agent's existing assignments via relationships
   */
  async addToolSlug(agentId: string, toolSlug: string, starshipId: string): Promise<AgentModel> {
    // Find the deployed tool instance by slug and starship
    const { ToolRepository } = await import('@starships/models');
    const toolRepository = new ToolRepository();

    const tool = await toolRepository.findBySlugAndStarship(toolSlug, starshipId);
    if (!tool) {
      throw new NotFoundError('Tool', `${toolSlug} on starship ${starshipId}`);
    }

    // Create the relationship
    await this.agentRepository.addToolRelationship(agentId, tool.id);

    // Return the updated agent
    const updatedAgent = await this.agentRepository.findById(agentId);
    if (!updatedAgent) {
      throw new NotFoundError('Agent', agentId);
    }
    return updatedAgent;
  }

  /**
   * Add a single tool by deriving starship from agent and validating access
   */
  async addToolSlugDerived(agentId: string, userId: string, toolSlug: string): Promise<AgentModel> {
    const starshipId = await this.getAgentStarshipIdOrThrow(agentId);
    const hasAccess = await this.validateStarshipAccess(starshipId, userId);
    if (!hasAccess) {
      throw new Error('Access denied to this starship');
    }
    return await this.addToolSlug(agentId, toolSlug, starshipId);
  }

  /**
   * Remove a single tool from an agent's assignments via relationships
   */
  async removeToolSlug(agentId: string, toolSlug: string, starshipId: string): Promise<AgentModel> {
    // Find the deployed tool instance by slug and starship
    const { ToolRepository } = await import('@starships/models');
    const toolRepository = new ToolRepository();

    const tool = await toolRepository.findBySlugAndStarship(toolSlug, starshipId);
    if (!tool) {
      throw new NotFoundError('Tool', `${toolSlug} on starship ${starshipId}`);
    }

    // Remove the relationship
    await this.agentRepository.removeToolRelationship(agentId, tool.id);

    // Return the updated agent
    const updatedAgent = await this.agentRepository.findById(agentId);
    if (!updatedAgent) {
      throw new NotFoundError('Agent', agentId);
    }
    return updatedAgent;
  }

  /**
   * Remove a single tool by deriving starship from agent and validating access
   */
  async removeToolSlugDerived(agentId: string, userId: string, toolSlug: string): Promise<AgentModel> {
    const starshipId = await this.getAgentStarshipIdOrThrow(agentId);
    const hasAccess = await this.validateStarshipAccess(starshipId, userId);
    if (!hasAccess) {
      throw new Error('Access denied to this starship');
    }
    return await this.removeToolSlug(agentId, toolSlug, starshipId);
  }

  // ============================================================================
  // MODEL ↔ INSTANCE CONVERSION METHODS
  // ============================================================================

  /**
   * Convert AgentModel to Agent instance, storing model ID in instance metadata
   */
  async toInstance(agentModel: AgentModel): Promise<Agent> {
    const agentParams = {
      name: agentModel.name,
      description: agentModel.description,
      model: agentModel.model,
      temperature: agentModel.temperature,
      maxTokens: agentModel.maxTokens,
      timeout: agentModel.timeout,
      systemPrompt: agentModel.systemPrompt,
      state: agentModel.state,
      blueprint: agentModel.blueprint,
      metadata: {
        id: agentModel.id,
      },
    } as AgentParams;
    const agentInstance = new Agent(agentParams);

    return agentInstance;
  }

  // ============================================================================
  // AGENT TESTING API
  // ============================================================================

  /**
   * Test agent execution with provided input
   * Executes agent in isolated environment without persisting to conversation
   */
  async testAgent(
    agentId: string,
    testInput: string | LlmMessage[],
    starshipId: string,
    authToken?: string
  ): Promise<{
    success: boolean;
    agent: string;
    input: string | LlmMessage[];
    output?: string;
    reasoning?: string;
    toolsUsed: string[];
    executionTime: number;
    model?: string;
    error?: string;
  }> {
    const startTime = Date.now();
    let toolsUsed: string[] = [];
    let output = '';
    let reasoning = '';

    try {
      // 1. Get agent by ID
      const agentModel = await this.agentRepository.findById(agentId);
      if (!agentModel) {
        throw new NotFoundError('Agent', agentId);
      }

      console.log('🤖 Agent loaded:', {
        id: agentModel.id,
        name: agentModel.name,
        slug: agentModel.slug,
        model: agentModel.model,
        hasSystemPrompt: !!agentModel.systemPrompt,
        systemPromptLength: agentModel.systemPrompt?.length || 0,
        stateType: typeof agentModel.state,
        stateMessages: Array.isArray(agentModel.state?.messages) ? agentModel.state.messages.length : 'not array',
      });

      // 2. Get deployed tools for this agent
      const resolvedTools = await this.getAgentTools(agentModel.id, starshipId);
      console.log('🔧 Tools resolved:', resolvedTools.length, 'tools found');

      // 3. Prepare agent params (same pattern as ConversationService)
      const baseState = agentModel.state && typeof agentModel.state === 'object' ? agentModel.state : { messages: [], tools: [] };

      const agentWithTools: AgentParams = {
        ...agentModel,
        state: {
          ...baseState,
          tools: resolvedTools as any, // Tool conversion handled by autopilot
          starshipId: starshipId,
        },
      };

      // 4. Convert test input to LLM messages format
      const llmMessages: LlmMessage[] = Array.isArray(testInput)
        ? testInput // Already in messages format
        : [{ role: 'user', content: testInput }]; // Convert string to message

      // 5. Prepare environment variables
      const env = getEnvConfig();
      const baseUrl = `${env.SERVER_URL}/api/v1`;
      const openRouterKey = env.OPENROUTER_API_KEY || '';
      const starshipEnv = await this.environmentService.getDecryptedEnvironment(starshipId);

      const secureEnv: Record<string, string> = {
        STARSHIP_ID: starshipId,
        BASE_URL: baseUrl,
        ...(authToken ? { AUTH_TOKEN: authToken } : {}),
        ...(openRouterKey ? { OPEN_ROUTER_KEY: String(openRouterKey) } : {}),
        ...starshipEnv,
      };

      // 6. Create agent instance and prepare execution
      const agent = new Agent(agentWithTools, {
        eventCallback: async (event) => {
          // Capture tool usage and output during execution
          if (event.type === 'tool_started' && (event as any).data?.name) {
            toolsUsed.push((event as any).data.name);
          }
          if (event.type === 'content_chunk' && (event as any).data?.content) {
            output += (event as any).data.content;
          }
          if (event.type === 'content_complete' && (event as any).data?.reasoning) {
            reasoning += (event as any).data.reasoning;
          }
        },
        secureEnv,
      });

      // 7. Execute with runner (same pattern as ConversationService)
      const runner = new ChildProcessRunner({
        memoryLimitMB: 256,
        timeoutMs: 60000, // 1 minute timeout for tests
        killGraceMs: 5000,
      });

      const blueprint = agent.getCurrentBlueprint();
      const exec = ExecutionItemUtils.createExecution();

      // 8. Seed execution state with ordered messages
      const orderedMessages: LlmMessage[] = [];

      // Add system prompt if present
      if (agentWithTools.systemPrompt && typeof agentWithTools.systemPrompt === 'string' && agentWithTools.systemPrompt.length > 0) {
        orderedMessages.push({ role: 'system', content: agentWithTools.systemPrompt });
      }

      // Add agent state messages if present
      if (Array.isArray(agentWithTools.state?.messages)) {
        const stateMsgs = (agentWithTools.state.messages as LlmMessage[]).filter(
          (m): m is LlmMessage => !!m && typeof m.role === 'string' && typeof m.content === 'string'
        );
        if (stateMsgs.length > 0) {
          orderedMessages.push(...stateMsgs);
        }
      }

      // Add test input messages
      if (llmMessages.length > 0) {
        orderedMessages.push(...llmMessages);
      }

      // Set execution state
      exec.state.messages = orderedMessages;
      exec.state.tools = resolvedTools;

      // 9. Execute the agent
      console.log('🚀 Starting agent execution:', {
        agentName: agentModel.name,
        inputMessages: llmMessages.length,
        totalMessages: orderedMessages.length,
        systemPrompt: agentModel.systemPrompt ? agentModel.systemPrompt.substring(0, 100) + '...' : 'NO SYSTEM PROMPT',
        toolsCount: resolvedTools.length,
      });

      await runner.run(blueprint, exec, {
        eventCallback: async (event: any) => {
          console.log('📡 Event received:', event.type, event.data ? Object.keys(event.data) : 'no data');

          // Capture content from streaming chunks
          if (event.type === 'content_chunk') {
            // Extract content from the chunk structure: event.data.chunk.choices[0].delta.content
            const chunkContent = event.data?.chunk?.choices?.[0]?.delta?.content;
            if (chunkContent && typeof chunkContent === 'string') {
              console.log('📝 Content chunk:', chunkContent.substring(0, 100));
              output += chunkContent;
            }
          }

          // Additional event handling for capturing results
          if (event.type === 'tool_started' && event.data?.name) {
            if (!toolsUsed.includes(event.data.name)) {
              toolsUsed.push(event.data.name);
            }
          }

          if (event.type === 'content_complete') {
            console.log('✅ Content complete:', event.data);
          }
        },
        secureEnv,
      } as any);

      console.log('🔍 Post-execution state:', {
        messagesCount: Array.isArray(exec.state.messages) ? exec.state.messages.length : 0,
        lastMessageRole:
          Array.isArray(exec.state.messages) && exec.state.messages.length > 0
            ? exec.state.messages[exec.state.messages.length - 1]?.role
            : undefined,
        lastMessageContentLength:
          Array.isArray(exec.state.messages) && exec.state.messages.length > 0
            ? exec.state.messages[exec.state.messages.length - 1]?.content?.length || 0
            : 0,
        capturedOutputLength: output.length,
        toolsUsed: toolsUsed,
      });

      // 10. Try to extract final response from execution state
      if (exec.state.messages && Array.isArray(exec.state.messages)) {
        console.log('🔍 All messages in final state:');
        exec.state.messages.forEach((msg, idx) => {
          console.log(`  ${idx}: ${msg.role} - ${msg.content?.substring(0, 100)}${msg.content?.length > 100 ? '...' : ''}`);
        });

        const lastMessage = exec.state.messages[exec.state.messages.length - 1];
        console.log('🔍 Last message analysis:', {
          exists: !!lastMessage,
          role: lastMessage?.role,
          hasContent: !!lastMessage?.content,
          contentPreview: lastMessage?.content?.substring(0, 200) + '...',
          hasReasoning: !!lastMessage?.reasoning,
        });

        if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
          output = lastMessage.content;
          if (lastMessage.reasoning) {
            reasoning = lastMessage.reasoning;
          }
          console.log('✅ Successfully extracted output from last message');
        } else {
          console.log('❌ Could not extract output from last message');
        }
      } else {
        console.log('❌ No messages array in execution state');
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        agent: agentModel.name,
        input: testInput,
        output: output || 'Agent executed successfully but produced no output',
        ...(reasoning ? { reasoning } : {}),
        toolsUsed,
        executionTime,
        model: agentModel.model,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        agent: agentId,
        input: testInput,
        toolsUsed,
        executionTime,
        error: error?.message || 'Unknown error during agent execution',
      };
    }
  }
}
