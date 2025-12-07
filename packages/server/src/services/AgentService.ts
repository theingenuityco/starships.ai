/**
 * Agent Service
 *
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and
 * stateless execution engine (autopilot Agent).
 */

import { Agent, AgentParams, ChildProcessRunner, ExecutionItemUtils, LlmMessage } from '@starships/autopilot';
import type { AutopilotEvent, EventCallback, LLMEvent, ToolEvent, ToolParams } from '@starships/autopilot';
import { ForbiddenError, NotFoundError, ValidationError } from '@starships/errors';
import {
  AgentRepository,
  AgentTemplateRepository,
  StarshipRepository,
  UserRepository,
  DEFAULT_AGENT_TIMEOUT_MS,
  DEFAULT_AGENT_TEMPERATURE,
  MAX_AGENT_MAX_TOKENS,
  MAX_AGENT_TIMEOUT_MS,
  MIN_AGENT_MAX_TOKENS,
  MIN_AGENT_TIMEOUT_MS,
} from '@starships/models';
import type {
  PendingAgentSummary,
  UserModel,
  StarshipModel,
  AgentModel,
  CreateAgentRequest,
  UpdateAgentRequest,
} from '@starships/protocol';
import { generateUniqueAgentSlug } from '@starships/models';
import { MessageService } from './MessageService';
import type { StreamingService } from './StreamingService';
import { EnvironmentService } from './EnvironmentService';
import { UsageService } from './UsageService';
import { BillingService } from './BillingService';
import { ConversationService } from './ConversationService';
import isEqual from 'lodash/isEqual';

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
      timeout: data.timeout || DEFAULT_AGENT_TIMEOUT_MS,
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
      timeout: data.timeout || DEFAULT_AGENT_TIMEOUT_MS,
      blueprint: generatedBlueprint, // Use the blueprint from Agent class (default or provided)
      systemPrompt: data.systemPrompt,
      state: agentState, // Use provided state or default initialization
      previewPrompts: data.previewPrompts,
      assignedToolSlugs: data.assignedToolSlugs,
      sourceTemplateId: data.sourceTemplateId,
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

    // Only published agents should appear in the public listing
    const publishedAgents = allAgents.filter((agent) => agent.publicationStatus === 'published');
    const total = publishedAgents.length;
    const offset = (page - 1) * limit;
    const paginatedAgents = publishedAgents.slice(offset, offset + limit);

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
   * Get agents that are pending publication approval (instance admin view)
   */
  async getPendingAgents(
    page: number = 1,
    limit: number = 50
  ): Promise<{
    agents: PendingAgentSummary[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }> {
    const allAgents = await this.agentRepository.findAll();
    const pendingAgents = allAgents.filter((agent) => agent.publicationStatus === 'pending_approval');
    const total = pendingAgents.length;
    const offset = (page - 1) * limit;
    const paginatedAgents = pendingAgents.slice(offset, offset + limit);

    // Enrich with user display name and starship label for admin UX,
    // while keeping publicationRequestedBy as the underlying user id.
    const userRepo = new UserRepository();
    const starshipRepo = new StarshipRepository();

    const enrichedAgents: PendingAgentSummary[] = [];

    for (const agent of paginatedAgents) {
      let requestedBy: PendingAgentSummary['requestedBy'] | undefined;
      let requestedByStarship: PendingAgentSummary['requestedByStarship'] | undefined;

      try {
        if (agent.publicationRequestedBy) {
          const [user, starship] = await Promise.all([
            userRepo.findById(agent.publicationRequestedBy as string) as Promise<UserModel | null>,
            starshipRepo.findById(agent.starshipId) as Promise<StarshipModel | null>,
          ]);

          if (user) {
            requestedBy = {
              id: user.id,
              name: user.displayName || user.email || user.id,
              avatar: user.avatar,
            };
          } else {
            requestedBy = {
              id: agent.publicationRequestedBy,
            };
          }

          if (starship) {
            requestedByStarship = {
              id: starship.id,
              name: starship.name || starship.slug,
              slug: starship.slug,
            };
          }
        }
      } catch {
        if (agent.publicationRequestedBy) {
          requestedBy = { id: agent.publicationRequestedBy };
        }
      }

      enrichedAgents.push({
        agent,
        requestedBy,
        requestedByStarship,
      });
    }

    return {
      agents: enrichedAgents,
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
  ): Promise<{
    agents: AgentModel[];
    total: number;
    pagination: {
      page: number;
      limit: number;
      total: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }> {
    // Validate access first
    await this.validateStarshipAccess(starshipId, userId);

    // Get all agents for the starship
    const allAgents = await this.getAgentsByStarship(starshipId);

    // Sort agents by newest first (createdAt desc), then by name for stability
    const sortedAgents = [...allAgents].sort((a, b) => {
      const aTs = a?.createdAt ? new Date(a.createdAt as string).getTime() : 0;
      const bTs = b?.createdAt ? new Date(b.createdAt as string).getTime() : 0;
      if (aTs !== bTs) return bTs - aTs;
      const aName = (a?.name || '') as string;
      const bName = (b?.name || '') as string;
      return aName.localeCompare(bName);
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedAgents = sortedAgents.slice(startIndex, startIndex + limit);

    return {
      agents: paginatedAgents,
      total: sortedAgents.length,
      pagination: {
        page,
        limit,
        total: sortedAgents.length,
        has_next: startIndex + limit < sortedAgents.length,
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
    starshipId: string
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

    // Aggregate LLM usage across the test run
    let aggUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
    let modelUsedAggregate: string | undefined;

    // Type guards for Autopilot events
    const isToolEvent = (event: AutopilotEvent): event is ToolEvent =>
      event.type === 'tool_started' || event.type === 'tool_complete' || event.type === 'tool_call_detected';

    const isLlmEvent = (event: AutopilotEvent): event is LLMEvent => event.type === 'content_chunk' || event.type === 'content_complete';

    // Unified event handler to capture content, tools and usage
    const onEvent: EventCallback = async (event) => {
      // Capture tool usage and output during execution
      if (isToolEvent(event) && event.type === 'tool_started' && event.data?.toolName) {
        const name = String(event.data.toolName);
        if (!toolsUsed.includes(name)) toolsUsed.push(name);
      }

      if (isLlmEvent(event) && event.type === 'content_chunk' && event.data?.chunk) {
        // Extract content from the chunk structure: event.data.chunk.choices[0].delta.content
        const chunk = event.data.chunk as Record<string, unknown>;
        const choices = chunk.choices as unknown;
        if (Array.isArray(choices) && choices.length > 0) {
          const first = choices[0] as Record<string, unknown>;
          const delta = first.delta as Record<string, unknown> | undefined;
          const chunkContent = typeof delta?.content === 'string' ? delta.content : undefined;
          if (chunkContent) {
            output += chunkContent;
          }
        }
        // Some providers emit usage on chunks; capture if present
        const usage = event.data.usage;
        const model = event.data.model;
        if (usage) {
          const pt = typeof usage.promptTokens === 'number' ? usage.promptTokens : 0;
          const ct = typeof usage.completionTokens === 'number' ? usage.completionTokens : 0;
          const tt = typeof usage.totalTokens === 'number' ? usage.totalTokens : pt + ct;
          const cst = typeof usage.cost === 'number' ? usage.cost : 0;
          aggUsage.promptTokens += pt;
          aggUsage.completionTokens += ct;
          aggUsage.totalTokens += tt;
          aggUsage.cost += cst;
          if (typeof model === 'string' && !modelUsedAggregate) modelUsedAggregate = model;
        }
      }

      if (isLlmEvent(event) && event.type === 'content_complete' && event.data) {
        // Persist usage totals for this completion if provided
        const usage = event.data.usage;
        const model = event.data.model;
        if (usage) {
          const pt = typeof usage.promptTokens === 'number' ? usage.promptTokens : 0;
          const ct = typeof usage.completionTokens === 'number' ? usage.completionTokens : 0;
          const tt = typeof usage.totalTokens === 'number' ? usage.totalTokens : pt + ct;
          const cst = typeof usage.cost === 'number' ? usage.cost : 0;
          aggUsage.promptTokens += pt;
          aggUsage.completionTokens += ct;
          aggUsage.totalTokens += tt;
          aggUsage.cost += cst;
        }
        if (typeof model === 'string' && !modelUsedAggregate) modelUsedAggregate = model;
      }

      // Keep existing logs in non-production for diagnostics
      try {
        if (process?.env?.NODE_ENV !== 'production') {
          if (event.type) {
            // data is optional; log keys only when present

            console.log(
              '📡 Event received:',
              event.type,
              'data' in event && event.data ? Object.keys(event.data as Record<string, unknown>) : 'no data'
            );
          }
        }
      } catch (err) {
        void err;
      }
    };

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

      // 2. Get deployed tools for this agent and convert to ToolParams
      const resolvedToolsModels = await this.getAgentTools(agentModel.id, starshipId);
      console.log('🔧 Tools resolved:', resolvedToolsModels.length, 'tools found');

      const resolvedTools: ToolParams[] = resolvedToolsModels
        .filter((tool) => tool.status !== 'draft' && tool.parameters && tool.blueprint)
        .map((tool) => ({
          name: tool.name,
          slug: tool.slug,
          description: tool.description,
          parameters: tool.parameters!,
          blueprint: tool.blueprint!,
          ...(tool.transforms && { transforms: tool.transforms }),
          ...(tool.mutations && { mutations: tool.mutations }),
          ...(tool.condition && { condition: tool.condition }),
        }));

      // 3. Prepare agent params (same pattern as ConversationService)
      const baseState = agentModel.state && typeof agentModel.state === 'object' ? agentModel.state : { messages: [], tools: [] };

      const agentWithTools: AgentParams = {
        ...agentModel,
        state: {
          ...baseState,
          tools: resolvedTools,
          starshipId: starshipId,
        },
      };

      // 4. Convert test input to LLM messages format
      const llmMessages: LlmMessage[] = Array.isArray(testInput)
        ? testInput // Already in messages format
        : [{ role: 'user', content: testInput }]; // Convert string to message

      // 5. Prepare runtime env (Starships host: only STARSHIP_ID is exposed to workflows)
      const runtimeEnv: Record<string, unknown> = {
        STARSHIP_ID: starshipId,
      };

      // 6. Create agent instance and prepare execution
      const agent = new Agent(agentWithTools, {
        eventCallback: onEvent,
        runtimeEnv,
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
        eventCallback: onEvent,
        runtimeEnv,
      });

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

      // Persist and bill aggregated usage (if any)
      try {
        if (aggUsage.totalTokens > 0 || aggUsage.cost > 0) {
          const usageService = new UsageService();
          const billingService = new BillingService();
          const conversationService = new ConversationService();

          // Create a lightweight archived conversation to satisfy FK and keep UI uncluttered
          const testConversation = await conversationService.createConversation({
            title: `Agent Test • ${agentModel.name ?? agentModel.slug ?? agentId}`,
            status: 'archived',
            starshipId,
            agentId: agentModel.id,
          });

          const usageRow = await usageService.createUsageForTurn({
            starshipId,
            conversationId: testConversation.id,
            promptTokens: aggUsage.promptTokens,
            completionTokens: aggUsage.completionTokens,
            totalTokens: aggUsage.totalTokens,
            cost: aggUsage.cost,
            ...(modelUsedAggregate ? { model: modelUsedAggregate } : {}),
          });
          try {
            await billingService.debitUsage(usageRow);
          } catch (e) {
            console.warn('[AGENT-TEST] Billing debit failed:', e instanceof Error ? e.message : String(e));
          }
        }
      } catch (e) {
        console.error('[AGENT-TEST] Failed to persist usage for test run:', e);
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
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        agent: agentId,
        input: testInput,
        toolsUsed,
        executionTime,
        error: error instanceof Error ? error.message : 'Unknown error during agent execution',
      };
    }
  }

  /**
   * Update agent to latest template version
   */
  async updateFromTemplate(agentId: string, userId: string): Promise<AgentModel> {
    // Verify ownership
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const starship = await this.starshipRepository.findById(agent.starshipId);
    if (!starship || starship.ownerId !== userId) {
      throw new ForbiddenError('You do not have permission to update this agent');
    }

    return await this.agentRepository.updateFromTemplate(agentId);
  }

  // ============================================================================
  // PUBLICATION WORKFLOW
  // ============================================================================

  /**
   * Request publication for an agent (owner or instance admin)
   * Moves agent from draft/rejected to pending_approval and records
   * the desired version bump and changelog.
   */
  async requestPublication(
    agentId: string,
    userId: string,
    options: { versionBump: 'patch' | 'minor' | 'major'; changelog: string }
  ): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    if (agent.publicationStatus === 'pending_approval') {
      throw new ValidationError('Agent is already pending approval');
    }

    // For agents that have already been promoted into a template (publishedTemplateId),
    // allow requesting publication again so a new version can be reviewed – but only
    // if the agent actually differs from its published template.
    if (agent.publicationStatus === 'published') {
      if (!agent.publishedTemplateId) {
        throw new ValidationError('Agent is already published');
      }

      const templateRepo = new AgentTemplateRepository();
      const template = await templateRepo.findById(agent.publishedTemplateId);
      if (!template) {
        throw new NotFoundError('AgentTemplate', agent.publishedTemplateId);
      }

      const normalizePreviewPrompts = (prompts: string[] | undefined | null): string[] =>
        (prompts || []).map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);

      const normalizeCore = (src: {
        name?: string;
        description?: string | null;
        model?: string;
        temperature?: number | null;
        maxTokens?: number | null;
        timeout?: number | null;
        systemPrompt?: string | null;
        blueprint?: unknown;
        previewPrompts?: string[] | null;
        category?: string | null;
      }) => {
        const blueprint =
          (src.blueprint as unknown) && typeof src.blueprint === 'object' ? (src.blueprint as unknown) : { nodes: [], edges: [] };

        return {
          name: src.name ?? '',
          description: src.description ?? '',
          model: src.model ?? '',
          temperature: src.temperature ?? null,
          maxTokens: src.maxTokens ?? null,
          timeout: src.timeout ?? null,
          systemPrompt: src.systemPrompt ?? '',
          blueprint,
          previewPrompts: normalizePreviewPrompts(src.previewPrompts),
          // Category is optional for AgentModel but required for AgentTemplateModel;
          // normalize to empty string when undefined so comparisons are stable.
          category: src.category ?? '',
        };
      };

      const agentCore = normalizeCore(agent);
      const templateCore = normalizeCore(template);

      const hasDiff = !isEqual(agentCore, templateCore);
      if (!hasDiff) {
        throw new ValidationError('Agent has no changes compared to its published template');
      }
    }
    // Determine requested version based on current version and bump type
    const currentVersion = agent.version || '1.0.0';
    const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
    let requestedVersion = currentVersion;

    if (match) {
      const major = Number(match[1]);
      const minor = Number(match[2]);
      const patch = Number(match[3]);

      switch (options.versionBump) {
        case 'patch':
          requestedVersion = `${major}.${minor}.${patch + 1}`;
          break;
        case 'minor':
          requestedVersion = `${major}.${minor + 1}.0`;
          break;
        case 'major':
          requestedVersion = `${major + 1}.0.0`;
          break;
      }
    } else {
      // Fallback for malformed versions
      requestedVersion = '1.0.0';
    }

    return await this.agentRepository.requestPublicationAtomic(agentId, {
      publicationStatus: 'pending_approval',
      publicationRequestedBy: userId,
      publicationVersionBump: options.versionBump,
      publicationRequestedVersion: requestedVersion,
      publicationChangelog: options.changelog,
    });
  }

  /**
   * Approve publication for an agent (instance admin only)
   * Moves agent from pending_approval to published, and promotes agent → template.
   */
  async approvePublication(agentId: string, adminUserId: string): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    if (agent.publicationStatus !== 'pending_approval') {
      throw new ValidationError('Agent is not pending approval');
    }

    // 1. Determine next version:
    // - Prefer owner-requested version from publish-request flow
    // - Fallback to simple minor bump for backwards compatibility
    const currentVersion = agent.version || '1.0.0';
    let nextVersion = agent.publicationRequestedVersion;

    if (!nextVersion) {
      const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
      nextVersion = match != null ? `${match[1]}.${Number(match[2]) + 1}.0` : '1.0.0';
    }

    // 2. Determine target template (publishedTemplateId or new template)
    //    and sanitize numeric fields to satisfy template validation constraints.
    const safeTemperature =
      typeof agent.temperature === 'number' && !Number.isNaN(agent.temperature) ? agent.temperature : DEFAULT_AGENT_TEMPERATURE;
    const safeMaxTokens =
      typeof agent.maxTokens === 'number' && !Number.isNaN(agent.maxTokens)
        ? Math.min(MAX_AGENT_MAX_TOKENS, Math.max(MIN_AGENT_MAX_TOKENS, agent.maxTokens))
        : undefined;
    const safeTimeout =
      typeof agent.timeout === 'number' && !Number.isNaN(agent.timeout)
        ? Math.min(MAX_AGENT_TIMEOUT_MS, Math.max(MIN_AGENT_TIMEOUT_MS, agent.timeout))
        : DEFAULT_AGENT_TIMEOUT_MS;

    const templateRepo = new AgentTemplateRepository();
    let targetTemplateId = agent.publishedTemplateId;

    if (targetTemplateId) {
      const existingTemplate = await templateRepo.findById(targetTemplateId);
      if (!existingTemplate) {
        // If the referenced template no longer exists, drop the link and create a new one
        targetTemplateId = undefined;
      }
    }

    if (!targetTemplateId) {
      // Create a new template from this agent
      const createdTemplate = await templateRepo.create({
        name: agent.name,
        slug: agent.slug,
        description: agent.description,
        // Prefer the agent's category when present; fall back to "general"
        category: agent.category ?? 'general',
        model: agent.model,
        temperature: safeTemperature,
        maxTokens: safeMaxTokens,
        timeout: safeTimeout,
        systemPrompt: agent.systemPrompt,
        state: agent.state!,
        blueprint: agent.blueprint!,
        icon: undefined,
        previewPrompts: agent.previewPrompts,
        assignedToolSlugs: [], // tools can be managed separately at template level
      });

      // Align template version with the bumped agent version
      await templateRepo.update(createdTemplate.id, { version: nextVersion });
      targetTemplateId = createdTemplate.id;
    } else {
      // Update existing template from this agent
      await templateRepo.update(targetTemplateId, {
        name: agent.name,
        description: agent.description,
        // Only update category if the agent has one explicitly set
        category: agent.category ?? 'general',
        model: agent.model,
        temperature: safeTemperature,
        maxTokens: safeMaxTokens,
        timeout: safeTimeout,
        systemPrompt: agent.systemPrompt,
        state: agent.state,
        blueprint: agent.blueprint,
        previewPrompts: agent.previewPrompts,
        version: nextVersion,
      });
    }

    // 3. Persist publication metadata on agent
    const updated = await this.agentRepository.update(agentId, {
      version: nextVersion,
      publicationStatus: 'published',
      publicationApprovedBy: adminUserId,
      publicationApprovedAt: new Date().toISOString(),
      publishedTemplateId: targetTemplateId,
    });

    if (!updated) {
      throw new NotFoundError('Agent', agentId);
    }

    return updated;
  }

  /**
   * Reject publication for an agent (instance admin only)
   * Moves agent from pending_approval to rejected.
   */
  async rejectPublication(agentId: string, adminUserId: string): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    if (agent.publicationStatus !== 'pending_approval') {
      throw new ValidationError('Agent is not pending approval');
    }

    const updated = await this.agentRepository.update(agentId, {
      publicationStatus: 'rejected',
      publicationApprovedBy: adminUserId,
      publicationApprovedAt: new Date().toISOString(),
    });

    if (!updated) {
      throw new NotFoundError('Agent', agentId);
    }

    return updated;
  }
}
