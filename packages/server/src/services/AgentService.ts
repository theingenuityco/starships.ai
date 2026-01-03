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
} from '@starships/protocol';
import { MessageService } from './MessageService';
import type { StreamingService } from './StreamingService';
import { ConnectorSecretService } from './ConnectorSecretService';
import { isInstanceAdmin } from '../utils/auth-helpers';
import { AttachmentService } from './AttachmentService';

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
      await this.agentRepository.setAgentToolPermissionBySlug({
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
    options: {
      versionBump: 'patch' | 'minor' | 'major';
      changelog: string;
      toolOverrides?: { toolId: string; versionBump: 'patch' | 'minor' | 'major'; changelog: string }[];
    }
  ): Promise<AgentModel> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    // Deployed marketplace agents cannot be modified/published directly; copy first.
    this.assertAgentIsEditable(agent, 'publish');

    // Enforce that only the owner of the agent's starship or an instance admin
    // can request publication. Routes already gate this, but we repeat the
    // check here for defense-in-depth in case the service is called directly.
    const userRepo = new UserRepository();
    const user = (await userRepo.findById(userId)) as UserModel | null;
    const isAdmin = isInstanceAdmin(user);

    if (!isAdmin) {
      const starship = await this.starshipRepository.findById(agent.starshipId);
      if (!starship || starship.ownerId !== userId) {
        throw new ForbiddenError('You do not have permission to request publication for this agent');
      }
    }

    if (agent.publicationStatus === 'pending_approval') {
      throw new ValidationError('Agent is already pending approval');
    }

    // For agents that have already been promoted into a template (publishedTemplateId),
    // allow requesting publication again so a new version can be reviewed.
    // We intentionally no longer enforce a strict diff check between the agent and its
    // published template here because important changes (like tool assignments or other
    // relationships) may not be reflected in the core template fields alone.
    if (agent.publicationStatus === 'published') {
      if (!agent.publishedTemplateId) {
        throw new ValidationError('Agent is already published');
      }

      const templateRepo = new AgentTemplateRepository();
      const template = await templateRepo.findById(agent.publishedTemplateId);
      if (!template) {
        throw new NotFoundError('AgentTemplate', agent.publishedTemplateId);
      }
    }

    // Optionally record per-tool publication metadata for this request.
    const toolOverrides = options.toolOverrides || [];
    if (toolOverrides.length > 0) {
      const toolRepo = new ToolRepository();
      const agentTools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);
      const agentToolIds = new Set(agentTools.map((t) => t.id));

      for (const override of toolOverrides) {
        try {
          const tool = await toolRepo.findById(override.toolId);
          if (!tool) continue;
          // Ensure the tool belongs to the same starship and is actually assigned to this agent
          if (tool.starshipId !== agent.starshipId || !agentToolIds.has(tool.id)) continue;

          const currentToolVersion = tool.version || '1.0.0';
          const match = currentToolVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
          let requestedToolVersion = currentToolVersion;

          if (match) {
            const major = Number(match[1]);
            const minor = Number(match[2]);
            const patch = Number(match[3]);

            switch (override.versionBump) {
              case 'patch':
                requestedToolVersion = `${major}.${minor}.${patch + 1}`;
                break;
              case 'minor':
                requestedToolVersion = `${major}.${minor + 1}.0`;
                break;
              case 'major':
                requestedToolVersion = `${major + 1}.0.0`;
                break;
            }
          } else {
            requestedToolVersion = '1.0.0';
          }

          await toolRepo.requestPublicationAtomic(tool.id, {
            publicationStatus: 'pending_approval',
            publicationRequestedBy: userId,
            publicationVersionBump: override.versionBump,
            publicationRequestedVersion: requestedToolVersion,
            publicationChangelog: override.changelog,
          });
        } catch (err) {
          // Tool override failures should not block agent publication request; just log.
          console.error('[AGENT-PUBLICATION] Failed to record tool override for publish request:', err);
        }
      }
    }

    // Determine requested version for the agent based on current version and bump type
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

    // Validate that the caller is an instance admin. The admin routes already
    // enforce this, but we re-check here to prevent misuse if the service is
    // ever invoked outside the HTTP layer.
    const userRepo = new UserRepository();
    const adminUser = (await userRepo.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can approve agent publication');
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
        // IMPORTANT:
        // Do NOT reuse instance slugs for marketplace templates.
        // Instance slugs include random suffixes for uniqueness; template slugs should be
        // stable + human-readable and will be derived from the template name.
        description: agent.description,
        role: agent.role || 'Assistant',
        // Prefer the agent's category when present; fall back to "general"
        category: agent.category ?? 'general',
        model: agent.model,
        temperature: safeTemperature,
        maxTokens: safeMaxTokens,
        reasoning: agent.reasoning,
        timeout: safeTimeout,
        systemPrompt: agent.systemPrompt,
        state: agent.state!,
        blueprint: agent.blueprint!,
        icon: undefined,
        previewPrompts: agent.previewPrompts,
        // Tools will be synchronized below based on the agent's assigned tools
        assignedToolSlugs: [],
      });

      // Align template version with the bumped agent version
      await templateRepo.update(createdTemplate.id, { version: nextVersion });
      targetTemplateId = createdTemplate.id;
    } else {
      // Update existing template from this agent
      await templateRepo.update(targetTemplateId, {
        name: agent.name,
        description: agent.description,
        role: agent.role || 'Assistant',
        // Only update category if the agent has one explicitly set
        category: agent.category ?? 'general',
        model: agent.model,
        temperature: safeTemperature,
        maxTokens: safeMaxTokens,
        reasoning: agent.reasoning,
        timeout: safeTimeout,
        systemPrompt: agent.systemPrompt,
        state: agent.state,
        blueprint: agent.blueprint,
        previewPrompts: agent.previewPrompts,
        version: nextVersion,
      });
      // 3a. After creating the template, we will also sync assigned tools below.
    }

    // 3. Sync tools: ensure each assigned tool has a ToolTemplate and propagate
    //    those tool template slugs onto the AgentTemplate as assignedToolSlugs.
    if (targetTemplateId) {
      try {
        const toolRepo = new ToolRepository();
        const toolTemplateRepo = new ToolTemplateRepository();

        // Load all tools currently assigned to this agent for its starship
        const agentTools = await this.agentRepository.getAgentTools(agent.id, agent.starshipId);

        const toolTemplateSlugs: string[] = [];

        for (const tool of agentTools) {
          // Only consider non-draft tools with a complete definition
          const hasParams =
            // Tools can be valid/publishable even with **no parameters**.
            // Treat any object-typed JSON schema as acceptable (properties may be empty or omitted).
            !!tool.parameters && tool.parameters.type === 'object';
          const hasBlueprint = !!(
            tool.blueprint &&
            typeof (tool.blueprint as { nodes?: unknown }).nodes !== 'undefined' &&
            Array.isArray((tool.blueprint as { nodes?: unknown[] }).nodes)
          );

          if (tool.status === 'draft' || !hasParams || !hasBlueprint) continue;

          let templateId = (tool as unknown as { publishedTemplateId?: string }).publishedTemplateId;
          let templateSlug: string | undefined;

          // Determine next tool version, honoring any publicationRequestedVersion from the request flow
          const nextToolVersion = tool.publicationRequestedVersion || tool.version || '1.0.0';

          if (templateId) {
            const existingTemplate = await toolTemplateRepo.findById(templateId);
            if (existingTemplate) {
              // Update existing template from this tool
              await toolTemplateRepo.update(templateId, {
                description: tool.description,
                parameters: tool.parameters,
                blueprint: tool.blueprint,
                transforms: tool.transforms,
                mutations: tool.mutations,
                condition: tool.condition,
                version: nextToolVersion,
              });
              templateSlug = existingTemplate.slug;
            } else {
              // Stale reference – drop it and treat as new template
              templateId = undefined;
            }
          }

          if (!templateId) {
            // Create a new ToolTemplate from this tool instance
            const createdTemplate = await toolTemplateRepo.create({
              name: tool.name,
              // IMPORTANT:
              // Do NOT reuse instance slugs for marketplace templates.
              // Instance slugs include random suffixes for uniqueness; template slugs should be
              // stable + human-readable and will be derived from the template name.
              description: tool.description,
              category: 'utility',
              parameters: tool.parameters!,
              blueprint: tool.blueprint!,
              transforms: tool.transforms,
              mutations: tool.mutations,
              condition: tool.condition,
              version: nextToolVersion,
            });

            templateId = createdTemplate.id;
            templateSlug = createdTemplate.slug;
          }

          // Link tool back to its template, bump version and clear publication metadata
          await toolRepo.update(tool.id, {
            version: nextToolVersion,
            publishedTemplateId: templateId,
          });

          if (templateSlug && !toolTemplateSlugs.includes(templateSlug)) {
            toolTemplateSlugs.push(templateSlug);
          }
        }

        // Always synchronize tool assignments onto the AgentTemplate, even when empty.
        // Otherwise, removing all publishable tools can never "clear" the template baseline,
        // which makes the builder perpetually think tools have changed after publishing.
        await templateRepo.update(targetTemplateId, { assignedToolSlugs: toolTemplateSlugs });
      } catch (err) {
        // Tool synchronization should never block agent publication; log and continue.
        console.error('[AGENT-PUBLICATION] Failed to synchronize tools for agent template:', err);
      }
    }

    // 3b. Ensure template has a public avatar
    if (targetTemplateId) {
      try {
        const templateRepoInternal = new AgentTemplateRepository();
        const existingAvatar = await templateRepoInternal.getAvatarStorageById(targetTemplateId);
        const hasAvatar = !!existingAvatar?.avatarS3Key;

        // Only reuse an existing agent avatar if present.
        // If the agent has no avatar, do NOT generate one during approval.
        //
        // IMPORTANT: For re-publish flows, we should also refresh the template avatar
        // when the agent's avatar is newer than what's currently stored on the template.
        if (agent.avatarAttachmentId) {
          const attachmentService = new AttachmentService();
          const existingAttachment = await attachmentService.getAttachmentWithUrl(agent.avatarAttachmentId, agent.starshipId);

          const toMs = (s?: string) => {
            if (!s) return NaN;
            const t = new Date(s).getTime();
            return Number.isFinite(t) ? t : NaN;
          };

          const templateAvatarMs = toMs(existingAvatar?.avatarUpdatedAt);
          const attachmentCreatedMs = toMs(existingAttachment?.createdAt);
          const shouldUpdateAvatar =
            !hasAvatar ||
            (Number.isFinite(templateAvatarMs) && Number.isFinite(attachmentCreatedMs) && attachmentCreatedMs > templateAvatarMs) ||
            (!Number.isFinite(templateAvatarMs) && Number.isFinite(attachmentCreatedMs));

          if (shouldUpdateAvatar && existingAttachment?.s3Key) {
            await templateRepoInternal.updateAvatarStorage(targetTemplateId, {
              avatarS3Key: existingAttachment.s3Key,
              avatarMimeType: existingAttachment.mimeType || 'image/png',
              // Use the attachment creation time when available so client diffs can compare reliably.
              avatarUpdatedAt: existingAttachment.createdAt || new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error('[AGENT-PUBLICATION] Failed to ensure template avatar:', err);
      }
    }

    // 4. Persist publication metadata on agent
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

    // Validate that the caller is an instance admin. The admin routes already
    // enforce this, but we re-check here to prevent misuse if the service is
    // ever invoked outside the HTTP layer.
    const userRepo = new UserRepository();
    const adminUser = (await userRepo.findById(adminUserId)) as UserModel | null;
    if (!isInstanceAdmin(adminUser)) {
      throw new ForbiddenError('Only instance admins can reject agent publication');
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
