/**
 * Agent Service
 *
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and
 * stateless execution engine (autopilot Agent).
 */

import { NotFoundError, ValidationError } from '@starships/errors';
import {
  AgentRepository,
  StarshipMemberRepository,
  StarshipRepository,
  UserRepository,
  DEFAULT_AGENT_TIMEOUT_MS,
  getConnection,
  PostgresConnection,
} from '@starships/models';
import type {
  AgentModel,
  CreateAgentRequest,
  UpdateAgentRequest,
  UserModel,
} from '@starships/protocol';
import { MessageService } from './MessageService';
import { ConnectorSecretService } from './ConnectorSecretService';
import { isInstanceAdmin } from '../utils/auth-helpers';

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

  constructor(connection?: PostgresConnection) {
    this.agentRepository = new AgentRepository(connection);
    this.starshipRepository = new StarshipRepository(connection);
    this.messageService = new MessageService();
    this.connectorSecretService = new ConnectorSecretService();
  }

  private assertAgentIsEditable(_agent: AgentModel, _action: string): void {
    // No-op: template immutability check removed with template system
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

    // Initialize state with default if not provided.
    const agentState = data.state || { tools: [], messages: [] };

    const agentData: CreateAgentRequest = {
      name: data.name,
      role: data.role || 'Assistant',
      description: data.description,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      timeout: data.timeout || DEFAULT_AGENT_TIMEOUT_MS,
      systemPrompt: data.systemPrompt,
      state: agentState, // Use provided state or default initialization
      previewPrompts: data.previewPrompts,
      assignedToolSlugs: data.assignedToolSlugs,
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
   * Delete agent and (optionally) delete tool instances that become unassigned.
   *
   * This only deletes a tool instance if, after the agent is deleted, that tool id no longer
   * appears in `agent_tools` (i.e. it's not assigned to any other agent).
   */
  async deleteAgentAndUnusedTools(agentId: string): Promise<{ deleted: boolean; deletedToolIds: string[] }> {
    const id = String(agentId || '').trim();
    if (!id) throw new ValidationError('Agent id is required');

    const agent = await this.agentRepository.findById(id);
    if (!agent) return { deleted: false, deletedToolIds: [] };

    const starshipId = String(agent.starshipId || '').trim();
    const conn = getConnection();

    const result = await conn.transaction(async (client) => {
      const toolRows = await client.query<{ tool_id: string }>(`SELECT tool_id FROM agent_tools WHERE agent_id = $1`, [id]);
      const toolIds = (toolRows.rows || [])
        .map((r) => (typeof r?.tool_id === 'string' ? r.tool_id.trim() : ''))
        .filter(Boolean);

      const delRes = await client.query(`DELETE FROM agents WHERE id = $1`, [id]);
      const deleted = (delRes.rowCount ?? 0) > 0;
      if (!deleted) return { deleted: false, deletedToolIds: [] };

      if (toolIds.length === 0) return { deleted: true, deletedToolIds: [] };

      const remainingRows = await client.query<{ tool_id: string }>(
        `SELECT DISTINCT tool_id FROM agent_tools WHERE tool_id = ANY($1::text[])`,
        [toolIds]
      );
      const stillAssigned = new Set((remainingRows.rows || []).map((r) => String(r.tool_id || '').trim()).filter(Boolean));
      const unusedToolIds = toolIds.filter((tid) => !stillAssigned.has(tid));

      if (unusedToolIds.length > 0) {
        // Defensive: ensure we only delete tool instances belonging to the same starship.
        await client.query(`DELETE FROM tools WHERE id = ANY($1::text[]) AND starship_id = $2`, [unusedToolIds, starshipId]);
      }

      return { deleted: true, deletedToolIds: unusedToolIds };
    });

    return result;
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
    order: 'ASC' | 'DESC' = 'DESC',
    search?: string
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

    const searchTerm = typeof search === 'string' && search.trim().length > 0 ? search.trim().toLowerCase() : null;

    const filteredAgents = searchTerm
      ? allAgents.filter((a) => {
          const name = typeof a?.name === 'string' ? a.name : '';
          const role = typeof a?.role === 'string' ? a.role : '';
          const desc = typeof a?.description === 'string' ? a.description : '';
          const slug = typeof a?.slug === 'string' ? a.slug : '';
          const category = typeof a?.category === 'string' ? a.category : '';
          const hay = `${name} ${role} ${desc} ${slug} ${category}`.toLowerCase();
          return hay.includes(searchTerm);
        })
      : allAgents;

    // Sort agents by createdAt, then by name for stability
    const sortedAgents = [...filteredAgents].sort((a, b) => {
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

}
