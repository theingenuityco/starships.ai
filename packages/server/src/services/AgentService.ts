/**
 * Agent Service
 *
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and
 * stateless execution engine (autopilot Agent).
 */

import { Agent, AgentParams } from '@starships/autopilot';
import { ForbiddenError, NotFoundError, ValidationError } from '@starships/errors';
import {
  AgentRepository,
  AgentTemplateRepository,
  StarshipMemberRepository,
  StarshipRepository,
  UserRepository,
  ToolRepository,
  ToolTemplateRepository,
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
  ToolModel,
} from '@starships/protocol';
import { MessageService } from './MessageService';
import { ConnectorSecretService } from './ConnectorSecretService';
import { isInstanceAdmin } from '../utils/auth-helpers';
import { PublicationService } from './PublicationService';

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

/**
 * Service class for managing agents and their execution
 */
export class AgentService {
  private agentRepository: AgentRepository;
  private starshipRepository: StarshipRepository;
  private starshipMemberRepository?: StarshipMemberRepository;
  private messageService: MessageService;
  // Kept for future use (runtime secrets, connector context, etc.)

  private connectorSecretService: ConnectorSecretService;

  constructor() {
    this.agentRepository = new AgentRepository();
    this.starshipRepository = new StarshipRepository();
    this.messageService = new MessageService();
    this.connectorSecretService = new ConnectorSecretService();
  }

  /**
   * Guard: agents deployed from marketplace templates are immutable.
   * We treat any agent with a sourceTemplateId as "deployed from marketplace".
   *
   * NOTE: This intentionally does not block `updateFromTemplate()` which is the
   * supported way to bring a deployed agent forward to the latest template.
   */
  private assertAgentIsEditable(agent: AgentModel, action: string): void {
    if (typeof agent.sourceTemplateId === 'string' && agent.sourceTemplateId.trim().length > 0) {
      throw new ValidationError(
        `Cannot ${action} agent "${agent.name}" because it was deployed from the marketplace. Create a copy to customize it.`
      );
    }
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
      role: data.role || 'Assistant',
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
   * Update agent and return as AgentModel
   */
  async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    const current = await this.agentRepository.findById(agentId);
    if (!current) return null;
    this.assertAgentIsEditable(current, 'edit');

    return await this.agentRepository.update(agentId, updates);
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

    this.assertAgentIsEditable(agent, 'move');
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

    // Bulk-load assigned tool slugs for this page of agents (avoid N+1).
    const toolRows = await this.agentRepository.getAssignedToolSlugsForAgents(paginatedAgents.map((a) => a.id));
    const toolSlugsByAgentId = new Map<string, string[]>();
    for (const row of toolRows) {
      const list = toolSlugsByAgentId.get(row.agentId) ?? [];
      list.push(row.toolSlug);
      toolSlugsByAgentId.set(row.agentId, list);
    }

    // Enrich with user display name and starship label for admin UX,
    // while keeping publicationRequestedBy as the underlying user id.
    const userRepo = new UserRepository();
    const starshipRepo = new StarshipRepository();

    // Avoid N+1 queries by preloading the small set of users and starships
    // referenced by this page of agents.
    const requestedUserIds = new Set<string>();
    const starshipIds = new Set<string>();

    for (const agent of paginatedAgents) {
      if (agent.publicationRequestedBy) {
        requestedUserIds.add(String(agent.publicationRequestedBy));
      }
      if (agent.starshipId) {
        starshipIds.add(agent.starshipId);
      }
    }

    let usersById = new Map<string, UserModel>();
    let starshipsById = new Map<string, StarshipModel>();

    try {
      const [allUsers, allStarships] = await Promise.all([userRepo.findAll(), starshipRepo.findAll()]);

      usersById = new Map((allUsers || []).filter((u) => requestedUserIds.has(u.id)).map((u) => [u.id, u]));

      starshipsById = new Map((allStarships || []).filter((s) => starshipIds.has(s.id)).map((s) => [s.id, s]));
    } catch {
      // If the bulk preload fails for any reason, we simply fall back
      // to showing minimal metadata below without blocking the response.
      usersById = new Map();
      starshipsById = new Map();
    }

    const enrichedAgents: PendingAgentSummary[] = [];

    for (const agent of paginatedAgents) {
      let requestedBy: PendingAgentSummary['requestedBy'] | undefined;
      let requestedByStarship: PendingAgentSummary['requestedByStarship'] | undefined;
      let assignedToolSlugs: string[] = [];

      if (agent.publicationRequestedBy) {
        const user = usersById.get(agent.publicationRequestedBy as string) || null;

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
      }

      const starship = starshipsById.get(agent.starshipId) || null;
      if (starship) {
        requestedByStarship = {
          id: starship.id,
          name: starship.name || starship.slug,
          slug: starship.slug,
        };
      }

      // Resolve assigned tools for this agent so admin review can see
      // the actual tool slugs attached to the agent, even though the
      // underlying relationship is stored via the junction table.
      assignedToolSlugs = (toolSlugsByAgentId.get(agent.id) || []).filter((slug) => typeof slug === 'string' && slug.trim().length > 0);

      enrichedAgents.push({
        agent: {
          ...agent,
          // Provide a denormalized view of assigned tool slugs strictly
          // for the admin pending agents view. This mirrors the
          // assignedToolSlugs used in other parts of the app while
          // keeping the underlying storage relationship-based.
          assignedToolSlugs,
        },
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
    const starship = await this.starshipRepository.findById(starshipId);

    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }

    // Instance admins always have access
    const userRepo = new UserRepository();
    const user = (await userRepo.findById(userId)) as UserModel | null;
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    if (isInstanceAdmin(user)) return true;

    // Owner has access
    if (starship.ownerId === userId) return true;

    // Collaborators (members) have access
    const memberRepo = this.starshipMemberRepository ?? new StarshipMemberRepository();
    this.starshipMemberRepository = memberRepo;
    return await memberRepo.isMember(userId, starshipId);
  }

  /**
   * Get agents by starship with access control
   */
  async getAgentsByStarshipWithAccess(
    starshipId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
    order: 'ASC' | 'DESC' = 'DESC'
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

    // Sort agents by createdAt, then by name for stability
    const sortedAgents = [...allAgents].sort((a, b) => {
      const aTs = a?.createdAt ? new Date(a.createdAt as string).getTime() : 0;
      const bTs = b?.createdAt ? new Date(b.createdAt as string).getTime() : 0;
      if (aTs !== bTs) {
        return order === 'ASC' ? aTs - bTs : bTs - aTs;
      }
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
   * Get agent→tool permissions for all agents/tools on a starship.
   * Returns only rows present in agent_tools.
   */
  async getStarshipAgentToolPermissions(
    starshipId: string,
    userId: string
  ): Promise<Array<{ agentId: string; toolId: string; toolSlug: string; permission: 'allow' | 'ask' | 'deny' }>> {
    const hasAccess = await this.validateStarshipAccess(starshipId, userId);
    if (!hasAccess) {
      throw new Error('Access denied to this starship');
    }
    return await this.agentRepository.getStarshipAgentToolPermissions(starshipId);
  }

  /**
   * Upsert tool permissions for a single agent by tool slug (derived starship + access).
   */
  async setAgentToolPermissionsDerived(
    agentId: string,
    userId: string,
    permissions: Array<{ toolSlug: string; permission: 'allow' | 'ask' | 'deny' }>
  ): Promise<{ ok: true }> {
    const starshipId = await this.getAgentStarshipIdOrThrow(agentId);
    const hasAccess = await this.validateStarshipAccess(starshipId, userId);
    if (!hasAccess) {
      throw new Error('Access denied to this starship');
    }

    for (const p of permissions) {
      if (!p?.toolSlug) continue;
      await this.agentRepository.setEffectiveToolPermissionBySlug({
        agentId,
        starshipId,
        toolSlug: p.toolSlug,
        permission: p.permission,
      });
    }

    return { ok: true };
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
   * Get tools that are pending publication for a given agent (admin view).
   * This is used on the instance admin approvals screen to surface which
   * tools will be published/updated alongside the agent.
   */
  async getPendingToolsForAgent(agentId: string): Promise<import('@starships/protocol').ToolModel[]> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const tools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);

    // For admin review, mirror the heuristics used in the builder's
    // AgentPublishModal: only show tools that are either:
    // - New templates (no templateId yet), or
    // - Have a newer template version available (template.version !== tool.version),
    // and which are non-draft with complete params + blueprint.
    const templateRepo = new ToolTemplateRepository();
    const templateCache = new Map<string, Awaited<ReturnType<(typeof templateRepo)['findById']>>>();

    const publishTools: import('@starships/protocol').ToolModel[] = [];

    for (const tool of tools) {
      // Skip draft or incomplete tools
      if (tool.status === 'draft') continue;

      const hasParams =
        // Tools can be valid/publishable even with **no parameters**.
        // Treat any object-typed JSON schema as acceptable (properties may be empty or omitted).
        !!tool.parameters && tool.parameters.type === 'object';

      const hasBlueprint =
        !!tool.blueprint &&
        typeof (tool.blueprint as { nodes?: unknown }).nodes !== 'undefined' &&
        Array.isArray((tool.blueprint as { nodes?: unknown[] }).nodes);

      if (!hasParams || !hasBlueprint) continue;

      const publishedTemplateId = (tool as unknown as { publishedTemplateId?: string }).publishedTemplateId;
      const isNewTemplate = !publishedTemplateId;
      let hasTemplateUpdate = false;

      if (publishedTemplateId) {
        let template = templateCache.get(publishedTemplateId);
        if (template === undefined) {
          try {
            template = await templateRepo.findById(publishedTemplateId);
          } catch {
            template = null;
          }
          templateCache.set(publishedTemplateId, template);
        }

        if (template && template.version && tool.version && template.version !== tool.version) {
          hasTemplateUpdate = true;
        }
      }

      if (isNewTemplate || hasTemplateUpdate) {
        publishTools.push(tool);
      }
    }

    return publishTools;
  }

  /**
   * Assign multiple tools to an agent via relationships (replaces existing assignments)
   */
  async assignToolSlugs(agentId: string, toolSlugs: string[], starshipId: string): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }
    this.assertAgentIsEditable(agent, 'edit');

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
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }
    this.assertAgentIsEditable(agent, 'edit');

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
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }
    this.assertAgentIsEditable(agent, 'edit');

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

    // 1) Sync the agent itself (including tool relationships + tool instance create/delete)
    const updatedAgent = await this.agentRepository.updateFromTemplate(agentId);

    // 2) Mirror startup behavior: update attached tool *instances* from their templates.
    // This is NOT best-effort for manual updates: if tool updates fail, surface the error
    // so the caller knows the agent is not fully reconciled.
    const toolRepo = new ToolRepository();
    const attachedTools = await this.agentRepository.getAgentToolsByRelationships(agentId);

    for (const tool of attachedTools) {
      if (!tool?.sourceTemplateId) continue;
      // Idempotent: ToolRepository.updateFromTemplate only syncs template-owned fields.
      await toolRepo.updateFromTemplate(tool.id);
    }

    return updatedAgent;
  }

  // ============================================================================
  // PUBLICATION WORKFLOW (delegated to PublicationService)
  // ============================================================================

  /**
   * Request publication for an agent (owner or instance admin)
   * Delegates to PublicationService for cleaner separation of concerns.
   */
  async requestPublication(
    agentId: string,
    userId: string,
    options: {
      versionBump: 'patch' | 'minor' | 'major';
      changelog: string;
      toolOverrides?: { toolId: string; versionBump: 'patch' | 'minor' | 'major'; changelog: string }[];
    }
  ): Promise<AgentModel> {
    const publicationService = new PublicationService();
    return await publicationService.requestPublication(agentId, userId, options);
  }

  /**
   * Approve publication for an agent (instance admin only)
   * Delegates to PublicationService.
   */
  async approvePublication(agentId: string, adminUserId: string): Promise<AgentModel> {
    const publicationService = new PublicationService();
    return await publicationService.approvePublication(agentId, adminUserId);
  }

  /**
   * Reject publication for an agent (instance admin only)
   * Delegates to PublicationService.
   */
  async rejectPublication(agentId: string, adminUserId: string): Promise<AgentModel> {
    const publicationService = new PublicationService();
    return await publicationService.rejectPublication(agentId, adminUserId);
  }

  /**
   * Prepare publication: Generate missing marketing content and return preview
   * Delegates to PublicationService.
   */
  async preparePublication(agentId: string, adminUserId: string): Promise<{
    agent: AgentModel;
    templateId: string;
    marketingContent: {
      avatarUrl?: string;
      problemStatementsText?: string[];
      problemStatementsImageUrl?: string;
      capabilitiesImageUrl?: string;
      tryThesePromptsImageUrl?: string;
    };
  }> {
    const publicationService = new PublicationService();
    return await publicationService.preparePublication(agentId, adminUserId);
  }

  /**
   * Regenerate specific marketing content item
   * Delegates to PublicationService.
   */
  async regenerateMarketingContent(
    agentId: string,
    templateId: string,
    type: 'avatar' | 'problem_statements_text' | 'problem_statements_image' | 'capabilities_image' | 'try_these_prompts_image',
    adminUserId: string
  ): Promise<{
    agent: AgentModel;
    marketingContent: {
      avatarUrl?: string;
      problemStatementsText?: string[];
      problemStatementsImageUrl?: string;
      capabilitiesImageUrl?: string;
      tryThesePromptsImageUrl?: string;
    };
  }> {
    const publicationService = new PublicationService();
    return await publicationService.regenerateMarketingContent(agentId, templateId, type, adminUserId);
  }

  /**
   * Update problem statements for a template (before publication)
   * Delegates to PublicationService.
   */
  async updateProblemStatements(templateId: string, statements: string[], adminUserId: string): Promise<{
    problemStatementsText: string[];
  }> {
    const publicationService = new PublicationService();
    return await publicationService.updateProblemStatements(templateId, statements, adminUserId);
  }

  /**
   * Confirm publication: Mark agent as published (template already exists with content)
   * Delegates to PublicationService.
   */
  async confirmPublication(agentId: string, adminUserId: string): Promise<AgentModel> {
    const publicationService = new PublicationService();
    return await publicationService.confirmPublication(agentId, adminUserId);
  }
}
