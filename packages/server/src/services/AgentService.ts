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
  PostgresConnection,
  StarshipDefinitionStore,
  StarshipDefinitionReconciler,
  serializeAgentDefinition,
  agentModelToDefinition,
  parseAgent,
  agentFilename,
  type AgentDefinition,
} from '@starships/models';
import type {
  AgentModel,
  CreateAgentRequest,
  UpdateAgentRequest,
  UserModel,
} from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { MessageService } from './MessageService';
import { ConnectorSecretService } from './ConnectorSecretService';
import { isInstanceAdmin } from '../utils/auth-helpers';

/**
 * Authored agent fields that live in the `.starship/agents/<slug>.md` file (and
 * are therefore reconciled from it under STARSHIP_FS_AUTHORITY). Everything else
 * on UpdateAgentRequest (avatar/profile attachment ids, agent `state`) is
 * index-only and always written straight to the DB regardless of the flag.
 */
const AUTHORED_AGENT_UPDATE_KEYS: ReadonlyArray<keyof UpdateAgentRequest> = [
  'name',
  'role',
  'description',
  'model',
  'category',
  'temperature',
  'maxTokens',
  'timeout',
  'reasoning',
  'systemPrompt',
  'previewPrompts',
  'version',
];

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
  private definitionStore: StarshipDefinitionStore;
  private reconciler: StarshipDefinitionReconciler;

  constructor(connection?: PostgresConnection) {
    this.agentRepository = new AgentRepository(connection);
    this.starshipRepository = new StarshipRepository(connection);
    this.messageService = new MessageService();
    this.connectorSecretService = new ConnectorSecretService();
    this.definitionStore = new StarshipDefinitionStore();
    // Reuse this service's repository (and its connection) inside the reconciler.
    this.reconciler = new StarshipDefinitionReconciler({ store: this.definitionStore, agentRepository: this.agentRepository });
  }

  /** Whether the filesystem-authoritative definition path is enabled. */
  private fsAuthority(): boolean {
    return getEnvConfig().STARSHIP_FS_AUTHORITY === true;
  }

  /**
   * The authored definition for an existing agent: parsed from its file when
   * present (source of truth), else derived from the index row (covers agents
   * not yet backfilled when the flag is freshly enabled).
   */
  private async loadAgentDefinition(agent: AgentModel): Promise<AgentDefinition> {
    const raw = await this.definitionStore.read(agent.starshipId, 'agents', agentFilename(agent.slug));
    if (raw !== null) return parseAgent(raw);
    return agentModelToDefinition(agent);
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
    };

    if (!this.fsAuthority()) {
      return await this.agentRepository.create(agentData, data.starshipId);
    }

    // Files-first: build a normalized definition, write the file, reconcile the
    // index. The file is the durable artifact; the index row is derived from it.
    const def = await this.agentRepository.buildCreateDefinition(agentData, data.starshipId);
    await this.definitionStore.ensureProvisioned(data.starshipId);
    await this.definitionStore.write(data.starshipId, 'agents', agentFilename(def.slug), serializeAgentDefinition(def));
    await this.reconciler.reconcile(data.starshipId, { entity: 'agents', filename: agentFilename(def.slug) });
    const created = await this.agentRepository.findById(def.id);
    if (!created) throw new Error(`agent ${def.id} was not indexed after reconcile`);
    return created;
  }

  /**
   * Update agent and return as AgentModel
   */
  async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    const current = await this.agentRepository.findById(agentId);
    if (!current) return null;
    this.assertAgentIsEditable(current, 'edit');

    if (!this.fsAuthority()) {
      return await this.agentRepository.update(agentId, updates);
    }

    // Split authored (file-owned) fields from index-only fields (attachments,
    // state). Authored changes go file-first + reconcile; index-only changes go
    // straight to the DB (the reconcile upsert preserves them on conflict).
    const authoredUpdates: UpdateAgentRequest = {};
    const indexOnlyUpdates: UpdateAgentRequest = {};
    for (const [key, value] of Object.entries(updates) as [keyof UpdateAgentRequest, unknown][]) {
      if (value === undefined) continue;
      if (AUTHORED_AGENT_UPDATE_KEYS.includes(key)) {
        (authoredUpdates as Record<string, unknown>)[key] = value;
      } else {
        (indexOnlyUpdates as Record<string, unknown>)[key] = value;
      }
    }

    if (Object.keys(authoredUpdates).length > 0) {
      const existingDef = await this.loadAgentDefinition(current);
      const nextDef = await this.agentRepository.buildUpdatedDefinition(existingDef, authoredUpdates, current.starshipId);
      await this.definitionStore.ensureProvisioned(current.starshipId);
      // Carry the immutable id forward and preserve connector scope from the file.
      nextDef.id = current.id;
      await this.definitionStore.write(current.starshipId, 'agents', agentFilename(nextDef.slug), serializeAgentDefinition(nextDef));
      // On slug (rename), drop the stale file so it does not become an orphan.
      if (nextDef.slug !== existingDef.slug) {
        await this.definitionStore.delete(current.starshipId, 'agents', agentFilename(existingDef.slug));
      }
      await this.reconciler.reconcile(current.starshipId, { entity: 'agents', filename: agentFilename(nextDef.slug) });
    }

    if (Object.keys(indexOnlyUpdates).length > 0) {
      await this.agentRepository.update(agentId, indexOnlyUpdates);
    }

    return await this.agentRepository.findById(agentId);
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
    if (this.fsAuthority()) {
      const current = await this.agentRepository.findById(agentId);
      if (current) {
        await this.definitionStore.delete(current.starshipId, 'agents', agentFilename(current.slug));
      }
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

    this.assertAgentIsEditable(agent, 'move');

    if (this.fsAuthority()) {
      // Move the definition file across volumes, preserving the immutable id so
      // ledger rows (messages/schedules) stay attached. The index starship_id is
      // updated by updateStarship below.
      const raw = await this.definitionStore.read(agent.starshipId, 'agents', agentFilename(agent.slug));
      if (raw !== null) {
        await this.definitionStore.ensureProvisioned(starshipId);
        await this.definitionStore.write(starshipId, 'agents', agentFilename(agent.slug), raw);
        await this.definitionStore.delete(agent.starshipId, 'agents', agentFilename(agent.slug));
      }
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


}
